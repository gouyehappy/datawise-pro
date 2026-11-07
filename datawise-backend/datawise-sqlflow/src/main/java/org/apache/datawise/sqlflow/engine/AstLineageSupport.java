package org.apache.datawise.sqlflow.engine;

import org.apache.datawise.sqlflow.analyzer.Analysis;
import org.apache.datawise.sqlflow.analyzer.Field;
import org.apache.datawise.sqlflow.analyzer.OutputColumn;
import org.apache.datawise.sqlflow.analyzer.Scope;
import org.apache.datawise.sqlflow.api.DialectCompatibility;
import org.apache.datawise.sqlflow.api.ParseQuality;
import org.apache.datawise.sqlflow.api.SqlFlowLineageResult;
import org.apache.datawise.sqlflow.metadata.QualifiedObjectName;
import org.apache.datawise.sqlflow.model.SqlFlowColumnLineage;
import org.apache.datawise.sqlflow.model.SqlFlowSourceRef;
import org.apache.datawise.sqlflow.model.SqlFlowWarning;
import org.apache.datawise.sqlflow.tree.AllColumns;
import org.apache.datawise.sqlflow.tree.SelectItem;
import org.apache.datawise.sqlflow.tree.SingleColumn;
import org.apache.datawise.sqlflow.tree.expression.ArithmeticBinaryExpression;
import org.apache.datawise.sqlflow.tree.expression.Cast;
import org.apache.datawise.sqlflow.tree.expression.DereferenceExpression;
import org.apache.datawise.sqlflow.tree.expression.Expression;
import org.apache.datawise.sqlflow.tree.expression.FunctionCall;
import org.apache.datawise.sqlflow.tree.expression.Identifier;
import org.apache.datawise.sqlflow.tree.literal.BooleanLiteral;
import org.apache.datawise.sqlflow.tree.literal.CharLiteral;
import org.apache.datawise.sqlflow.tree.literal.DecimalLiteral;
import org.apache.datawise.sqlflow.tree.literal.DoubleLiteral;
import org.apache.datawise.sqlflow.tree.literal.LongLiteral;
import org.apache.datawise.sqlflow.tree.literal.NullLiteral;
import org.apache.datawise.sqlflow.tree.literal.StringLiteral;
import org.apache.datawise.sqlflow.tree.relation.QuerySpecification;
import org.apache.datawise.sqlflow.tree.statement.CreateTableAsSelect;
import org.apache.datawise.sqlflow.tree.statement.Insert;
import org.apache.datawise.sqlflow.tree.statement.Query;
import org.apache.datawise.sqlflow.tree.statement.Statement;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.Set;

final class AstLineageSupport {

    private AstLineageSupport() {
    }

    static SqlFlowLineageResult fromAnalysis(
            Analysis analysis,
            Scope scope,
            List<SqlFlowWarning> warnings,
            String engineId,
            String engineVersion,
            DialectCompatibility dialectCompatibility
    ) {
        List<String> expressionSummaries = extractExpressionSummaries(analysis.getStatement());
        Optional<List<OutputColumn>> outputColumns = analysis.getOutputColumns();
        if (outputColumns.isPresent() && !outputColumns.get().isEmpty()) {
            return buildResult(
                    mapOutputColumns(outputColumns.get(), expressionSummaries),
                    warnings,
                    engineId,
                    engineVersion,
                    dialectCompatibility
            );
        }

        List<SqlFlowColumnLineage> scopeColumns = mapScope(analysis, scope, expressionSummaries);
        if (!scopeColumns.isEmpty()) {
            return buildResult(scopeColumns, warnings, engineId, engineVersion, dialectCompatibility);
        }

        return partial(engineId, engineVersion, dialectCompatibility, "No column lineage produced for statement", warnings);
    }

    static SqlFlowLineageResult partial(
            String engineId,
            String engineVersion,
            DialectCompatibility dialectCompatibility,
            String message,
            List<SqlFlowWarning> warnings
    ) {
        List<SqlFlowWarning> merged = new ArrayList<>(warnings == null ? List.of() : warnings);
        merged.add(SqlFlowWarning.of("PARTIAL", message));
        return new SqlFlowLineageResult(
                List.of(),
                List.copyOf(merged),
                ParseQuality.PARTIAL,
                engineId,
                engineVersion,
                dialectCompatibility,
                null
        );
    }

    private static List<SqlFlowColumnLineage> mapOutputColumns(List<OutputColumn> outputColumns, List<String> expressionSummaries) {
        List<SqlFlowColumnLineage> columns = new ArrayList<>();
        for (int i = 0; i < outputColumns.size(); i++) {
            OutputColumn outputColumn = outputColumns.get(i);
            columns.add(toColumnLineage(
                    outputColumn.getColumn(),
                    outputColumn.getSourceColumns(),
                    expressionSummaryAt(expressionSummaries, i)
            ));
        }
        return columns;
    }

    private static List<SqlFlowColumnLineage> mapScope(Analysis analysis, Scope scope, List<String> expressionSummaries) {
        List<SqlFlowColumnLineage> columns = new ArrayList<>();
        List<Field> fields = List.copyOf(scope.getRelationType().getVisibleFields());
        for (int i = 0; i < fields.size(); i++) {
            Field field = fields.get(i);
            String name = field.getName().orElse("?");
            columns.add(toColumnLineage(
                    name,
                    analysis.getSourceColumns(field),
                    expressionSummaryAt(expressionSummaries, i)
            ));
        }
        return columns;
    }

    private static SqlFlowLineageResult buildResult(
            List<SqlFlowColumnLineage> columns,
            List<SqlFlowWarning> warnings,
            String engineId,
            String engineVersion,
            DialectCompatibility dialectCompatibility
    ) {
        ParseQuality quality = columns.isEmpty() ? ParseQuality.PARTIAL : ParseQuality.COMPLETE;
        return new SqlFlowLineageResult(columns, warnings, quality, engineId, engineVersion, dialectCompatibility, null);
    }

    private static SqlFlowColumnLineage toColumnLineage(
            String outputColumn,
            Set<Analysis.SourceColumn> sources,
            String expressionSummary
    ) {
        List<SqlFlowSourceRef> refs = new ArrayList<>();
        for (Analysis.SourceColumn source : sources) {
            QualifiedObjectName tableName = source.getTableName();
            refs.add(new SqlFlowSourceRef(
                    tableName.getCatalogName(),
                    tableName.getSchemaName(),
                    tableName.getObjectName(),
                    source.getColumnName(),
                    null
            ));
        }
        return new SqlFlowColumnLineage(outputColumn, refs, expressionSummary);
    }

    private static String expressionSummaryAt(List<String> expressionSummaries, int index) {
        if (index < 0 || index >= expressionSummaries.size()) {
            return null;
        }
        return expressionSummaries.get(index);
    }

    private static List<String> extractExpressionSummaries(Statement statement) {
        if (statement instanceof Query query) {
            return extractFromQuery(query);
        }
        if (statement instanceof Insert insert) {
            return extractFromQuery(insert.getQuery());
        }
        if (statement instanceof CreateTableAsSelect ctas) {
            return extractFromQuery(ctas.getQuery());
        }
        return List.of();
    }

    private static List<String> extractFromQuery(Query query) {
        if (!(query.getQueryBody() instanceof QuerySpecification querySpecification)) {
            return List.of();
        }
        List<String> summaries = new ArrayList<>();
        for (SelectItem item : querySpecification.getSelect().getSelectItems()) {
            if (item instanceof SingleColumn singleColumn) {
                Expression expression = singleColumn.getExpression();
                summaries.add(formatExpression(expression));
            } else if (item instanceof AllColumns allColumns) {
                summaries.add(allColumns.toString());
            } else {
                summaries.add(item.toString());
            }
        }
        return summaries;
    }

    private static String formatExpression(Expression expression) {
        if (expression instanceof Identifier identifier) {
            return identifier.getValue();
        }
        if (expression instanceof DereferenceExpression dereferenceExpression) {
            var qualifiedName = DereferenceExpression.getQualifiedName(dereferenceExpression);
            if (qualifiedName != null) {
                return String.join(".", qualifiedName.getParts());
            }
        }
        if (expression instanceof FunctionCall functionCall) {
            List<String> args = functionCall.getArguments().stream()
                    .map(AstLineageSupport::formatExpression)
                    .toList();
            return functionCall.getName() + "(" + String.join(", ", args) + ")";
        }
        if (expression instanceof ArithmeticBinaryExpression binaryExpression) {
            return formatExpression(binaryExpression.getLeft())
                    + " " + binaryExpression.getOperator().getValue() + " "
                    + formatExpression(binaryExpression.getRight());
        }
        if (expression instanceof Cast cast) {
            return "CAST(" + formatExpression(cast.getExpression()) + " AS " + cast.getType() + ")";
        }
        if (expression instanceof StringLiteral stringLiteral) {
            return "'" + stringLiteral.getValue().replace("'", "''") + "'";
        }
        if (expression instanceof CharLiteral charLiteral) {
            return "'" + charLiteral.getValue().replace("'", "''") + "'";
        }
        if (expression instanceof LongLiteral longLiteral) {
            return String.valueOf(longLiteral.getValue());
        }
        if (expression instanceof DoubleLiteral doubleLiteral) {
            return String.valueOf(doubleLiteral.getValue());
        }
        if (expression instanceof DecimalLiteral decimalLiteral) {
            return decimalLiteral.getValue();
        }
        if (expression instanceof BooleanLiteral booleanLiteral) {
            return String.valueOf(booleanLiteral.getValue());
        }
        if (expression instanceof NullLiteral) {
            return "NULL";
        }
        return expression.toString();
    }
}
