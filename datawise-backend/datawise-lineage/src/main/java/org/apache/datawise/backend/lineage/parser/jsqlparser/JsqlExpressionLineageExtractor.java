package org.apache.datawise.backend.lineage.parser.jsqlparser;

import net.sf.jsqlparser.expression.Alias;
import net.sf.jsqlparser.expression.AnalyticExpression;
import net.sf.jsqlparser.expression.BinaryExpression;
import net.sf.jsqlparser.expression.CastExpression;
import net.sf.jsqlparser.expression.Expression;
import net.sf.jsqlparser.expression.Function;
import net.sf.jsqlparser.expression.LongValue;
import net.sf.jsqlparser.expression.NullValue;
import net.sf.jsqlparser.expression.Parenthesis;
import net.sf.jsqlparser.expression.SignedExpression;
import net.sf.jsqlparser.expression.StringValue;
import net.sf.jsqlparser.expression.operators.relational.ExpressionList;
import net.sf.jsqlparser.schema.Column;
import net.sf.jsqlparser.statement.select.AllColumns;
import net.sf.jsqlparser.statement.select.AllTableColumns;
import org.apache.datawise.backend.lineage.model.ColumnLineage;
import org.apache.datawise.backend.lineage.model.ExpressionNode;
import org.apache.datawise.backend.lineage.model.LineageWarning;
import org.apache.datawise.backend.lineage.model.SourceKind;
import org.apache.datawise.backend.lineage.model.SourceRef;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

final class JsqlExpressionLineageExtractor {

    record Extraction(
            List<SourceRef> sources,
            ExpressionNode expressionTree
    ) {
        static Extraction empty() {
            return new Extraction(List.of(), null);
        }
    }

    private final String connectionId;
    private final String database;
    private final JsqlScopeContext scope;
    private final List<LineageWarning> warnings;

    JsqlExpressionLineageExtractor(
            String connectionId,
            String database,
            JsqlScopeContext scope,
            List<LineageWarning> warnings
    ) {
        this.connectionId = connectionId;
        this.database = database;
        this.scope = scope;
        this.warnings = warnings;
    }

    Extraction extract(Expression expression) {
        if (expression == null) {
            return Extraction.empty();
        }
        Set<SourceRef> sources = new LinkedHashSet<>();
        ExpressionNode tree = walk(expression, sources);
        return new Extraction(List.copyOf(sources), tree);
    }

    private ExpressionNode walk(Expression expression, Set<SourceRef> sources) {
        if (expression instanceof Parenthesis parenthesis) {
            return walk(parenthesis.getExpression(), sources);
        }
        if (expression instanceof SignedExpression signed) {
            return walk(signed.getExpression(), sources);
        }
        if (expression instanceof Column column) {
            String tableQualifier = column.getTable() != null ? column.getTable().getName() : null;
            String columnName = column.getColumnName();
            if (tableQualifier != null) {
                var derived = scope.resolveDerivedColumn(tableQualifier, columnName);
                if (derived.isPresent()) {
                    return materializeDerivedColumn(derived.get(), sources);
                }
            } else {
                var derived = scope.resolveUnqualifiedColumn(columnName);
                if (derived.isPresent()) {
                    return materializeDerivedColumn(derived.get(), sources);
                }
            }
            SourceRef ref = toSourceRef(column);
            sources.add(ref);
            return new ExpressionNode.ColumnRef(ref);
        }
        if (expression instanceof Function function) {
            return walkFunction(function, sources);
        }
        if (expression instanceof AnalyticExpression analytic) {
            return walkAnalytic(analytic, sources);
        }
        if (expression instanceof BinaryExpression binary) {
            ExpressionNode left = walk(binary.getLeftExpression(), sources);
            ExpressionNode right = walk(binary.getRightExpression(), sources);
            return new ExpressionNode.Binary(binary.getStringExpression(), left, right);
        }
        if (expression instanceof StringValue stringValue) {
            return new ExpressionNode.Literal(stringValue.getValue(), "string");
        }
        if (expression instanceof LongValue longValue) {
            return new ExpressionNode.Literal(String.valueOf(longValue.getValue()), "number");
        }
        if (expression instanceof NullValue) {
            return new ExpressionNode.Literal("NULL", "null");
        }
        if (expression instanceof CastExpression castExpression) {
            ExpressionNode inner = walk(castExpression.getLeftExpression(), sources);
            return new ExpressionNode.CastExpr(inner, castExpression.getColDataType() != null
                    ? castExpression.getColDataType().toString()
                    : null);
        }
        if (expression instanceof net.sf.jsqlparser.expression.CaseExpression caseExpression) {
            List<ExpressionNode.WhenThen> whens = new ArrayList<>();
            if (caseExpression.getWhenClauses() != null) {
                for (var whenClause : caseExpression.getWhenClauses()) {
                    whens.add(new ExpressionNode.WhenThen(
                            walk(whenClause.getWhenExpression(), sources),
                            walk(whenClause.getThenExpression(), sources)
                    ));
                }
            }
            ExpressionNode elseExpr = caseExpression.getElseExpression() != null
                    ? walk(caseExpression.getElseExpression(), sources)
                    : null;
            return new ExpressionNode.CaseExpr(whens, elseExpr);
        }
        if (expression instanceof AllTableColumns allTableColumns) {
            String table = allTableColumns.getTable() != null
                    ? allTableColumns.getTable().getName()
                    : null;
            warnings.add(LineageWarning.of(
                    "UNSUPPORTED_SYNTAX",
                    "SELECT table.* expansion requires schema metadata: " + table
            ));
            return new ExpressionNode.AllColumns(table);
        }
        if (expression instanceof AllColumns) {
            warnings.add(LineageWarning.of(
                    "UNSUPPORTED_SYNTAX",
                    "SELECT * expansion requires schema metadata"
            ));
            return new ExpressionNode.AllColumns(null);
        }
        warnings.add(LineageWarning.of(
                "UNSUPPORTED_SYNTAX",
                "Unsupported expression: " + expression.getClass().getSimpleName()
        ));
        return new ExpressionNode.Literal(expression.toString(), "unknown");
    }

    private ExpressionNode walkAnalytic(AnalyticExpression analytic, Set<SourceRef> sources) {
        List<ExpressionNode> args = new ArrayList<>();
        if (analytic.getExpression() != null) {
            args.add(walk(analytic.getExpression(), sources));
        }
        if (analytic.getPartitionExpressionList() != null) {
            for (Expression partition : analytic.getPartitionExpressionList()) {
                args.add(walk(partition, sources));
            }
        }
        if (analytic.getOrderByElements() != null) {
            for (var orderBy : analytic.getOrderByElements()) {
                if (orderBy.getExpression() != null) {
                    args.add(walk(orderBy.getExpression(), sources));
                }
            }
        }
        String name = analytic.getName() != null ? analytic.getName() : "ANALYTIC";
        return new ExpressionNode.Function(name + " OVER", args);
    }

    private ExpressionNode walkFunction(Function function, Set<SourceRef> sources) {
        String name = function.getName();
        List<ExpressionNode> args = new ArrayList<>();
        ExpressionList<?> parameters = function.getParameters();
        if (parameters != null) {
            for (Expression parameter : parameters) {
                args.add(walk(parameter, sources));
            }
        }
        if (function.isDistinct()) {
            name = "DISTINCT " + name;
        }
        return new ExpressionNode.Function(name, args);
    }

    private SourceRef toSourceRef(Column column) {
        String columnName = column.getColumnName();
        String tableQualifier = column.getTable() != null ? column.getTable().getName() : null;
        String resolvedTable = scope.resolveTableName(tableQualifier);
        if (resolvedTable == null && tableQualifier == null) {
            resolvedTable = scope.resolveSinglePhysicalTableName().orElse(null);
        }
        if (resolvedTable == null && tableQualifier != null) {
            resolvedTable = tableQualifier;
        }
        String schema = null;
        String table = resolvedTable;
        if (resolvedTable != null && resolvedTable.contains(".")) {
            String[] parts = resolvedTable.split("\\.", 2);
            schema = parts[0];
            table = parts[1];
        }
        JsqlScopeContext.SourceKind scopeKind = scope.tableKind(table);
        SourceKind kind = scopeKind == JsqlScopeContext.SourceKind.CTE
                ? SourceKind.CTE
                : SourceKind.PHYSICAL_TABLE;
        if (tableQualifier != null && resolvedTable == null) {
            warnings.add(LineageWarning.of(
                    "UNRESOLVED_COLUMN",
                    "Unable to resolve table alias: " + tableQualifier + "." + columnName
            ));
        }
        return new SourceRef(
                connectionId,
                database,
                schema,
                table,
                columnName,
                tableQualifier,
                kind
        );
    }

    static String outputColumnName(Expression expression, Alias alias) {
        if (alias != null && alias.getName() != null && !alias.getName().isBlank()) {
            return alias.getName();
        }
        if (expression instanceof Column column) {
            return column.getColumnName();
        }
        return expression.toString().trim();
    }

    private ExpressionNode materializeDerivedColumn(ColumnLineage derived, Set<SourceRef> sources) {
        sources.addAll(derived.sources());
        ExpressionNode derivedTree = derived.expressionTree();
        if (derivedTree != null) {
            return derivedTree;
        }
        if (!derived.sources().isEmpty()) {
            return new ExpressionNode.ColumnRef(derived.sources().get(0));
        }
        return new ExpressionNode.Literal(derived.outputColumn(), "derived");
    }
}
