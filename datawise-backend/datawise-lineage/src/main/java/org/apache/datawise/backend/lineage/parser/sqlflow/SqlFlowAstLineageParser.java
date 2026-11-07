package org.apache.datawise.backend.lineage.parser.sqlflow;

import net.sf.jsqlparser.JSQLParserException;
import net.sf.jsqlparser.expression.BinaryExpression;
import net.sf.jsqlparser.expression.CaseExpression;
import net.sf.jsqlparser.expression.CastExpression;
import net.sf.jsqlparser.expression.Expression;
import net.sf.jsqlparser.expression.Function;
import net.sf.jsqlparser.expression.Parenthesis;
import net.sf.jsqlparser.expression.WhenClause;
import net.sf.jsqlparser.parser.CCJSqlParserUtil;
import net.sf.jsqlparser.schema.Column;
import org.apache.datawise.backend.domain.LineageDialectCompatibility;
import org.apache.datawise.backend.lineage.model.ColumnLineage;
import org.apache.datawise.backend.lineage.model.ExpressionNode;
import org.apache.datawise.backend.lineage.model.LineageParseRequest;
import org.apache.datawise.backend.lineage.model.LineageParseResult;
import org.apache.datawise.backend.lineage.model.LineageWarning;
import org.apache.datawise.backend.lineage.model.ParseStatus;
import org.apache.datawise.backend.lineage.model.SourceKind;
import org.apache.datawise.backend.lineage.model.SourceRef;
import org.apache.datawise.backend.lineage.spi.SqlLineageParser;
import org.apache.datawise.backend.lineage.spi.SchemaCatalog;
import org.apache.datawise.sqlflow.AstVisitor;
import org.apache.datawise.sqlflow.SqlFlow;
import org.apache.datawise.sqlflow.SqlFlowLineageService;
import org.apache.datawise.sqlflow.SqlFlowLineageServices;
import org.apache.datawise.sqlflow.def.CatalogDef;
import org.apache.datawise.sqlflow.def.ColumnDef;
import org.apache.datawise.sqlflow.def.SchemaDef;
import org.apache.datawise.sqlflow.def.TableDef;
import org.apache.datawise.sqlflow.api.ParseQuality;
import org.apache.datawise.sqlflow.api.SqlFlowAnalyzeRequest;
import org.apache.datawise.sqlflow.api.SqlFlowLineageResult;
import org.apache.datawise.sqlflow.tree.Node;
import org.apache.datawise.sqlflow.tree.QualifiedName;
import org.apache.datawise.sqlflow.tree.relation.Table;
import org.apache.datawise.sqlflow.tree.statement.Statement;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Component
public class SqlFlowAstLineageParser implements SqlLineageParser {

    private static final int PRIORITY = 50;
    private static final Pattern FUNCTION_NAME = Pattern.compile("^\\s*([A-Za-z_][A-Za-z0-9_]*)\\s*\\(");
    private final SqlFlowLineageService sqlFlow = SqlFlowLineageServices.createDefault();

    @Override
    public boolean supports(String dbType) {
        return true;
    }

    @Override
    public int priority() {
        return PRIORITY;
    }

    @Override
    public String engineId() {
        return sqlFlow.engineId();
    }

    @Override
    public String engineVersion() {
        return "ast";
    }

    @Override
    public LineageParseResult parse(LineageParseRequest request) {
        List<TableDef> metadataTables = buildMetadataTables(request);
        SqlFlowLineageResult result = sqlFlow.analyze(
                new SqlFlowAnalyzeRequest(request.sql(), request.dbType(), metadataTables)
        );
        return new LineageParseResult(
                mapColumns(result, request),
                mapWarnings(result),
                mapStatus(result.quality()),
                result.engineId(),
                result.engineVersion(),
                mapCompatibility(result)
        );
    }

    private static List<ColumnLineage> mapColumns(SqlFlowLineageResult result, LineageParseRequest request) {
        return result.columns().stream()
                .map(column -> {
                    List<SourceRef> sourceRefs = column.sources().stream()
                            .map(source -> new SourceRef(
                                    request.connectionId(),
                                    request.database(),
                                    source.schema(),
                                    source.table(),
                                    source.column(),
                                    source.tableAlias(),
                                    SourceKind.PHYSICAL_TABLE
                            ))
                            .toList();
                    return new ColumnLineage(
                            column.outputColumn(),
                            sourceRefs,
                            toExpressionNode(column.expressionSummary(), sourceRefs)
                    );
                })
                .toList();
    }

    private static ExpressionNode toExpressionNode(String expressionSummary, List<SourceRef> sourceRefs) {
        if (expressionSummary == null || expressionSummary.isBlank()) {
            return null;
        }
        try {
            Expression parsed = CCJSqlParserUtil.parseExpression(expressionSummary);
            if (isDirectColumnExpression(parsed)) {
                return null;
            }
            return mapParsedExpression(parsed, sourceRefs, buildSourceIndex(sourceRefs));
        } catch (JSQLParserException ignored) {
            List<ExpressionNode> args = sourceRefs.stream()
                    .map(ExpressionNode.ColumnRef::new)
                    .map(ExpressionNode.class::cast)
                    .toList();
            String functionName = extractFunctionName(expressionSummary);
            return new ExpressionNode.Function(functionName, args);
        }
    }

    private static String extractFunctionName(String expressionSummary) {
        Matcher matcher = FUNCTION_NAME.matcher(expressionSummary);
        if (matcher.find()) {
            return matcher.group(1);
        }
        return "expr";
    }

    private static boolean isDirectColumnExpression(Expression expression) {
        if (expression instanceof Column) {
            return true;
        }
        if (expression instanceof Parenthesis parenthesis) {
            return isDirectColumnExpression(parenthesis.getExpression());
        }
        return false;
    }

    private static Map<String, SourceRef> buildSourceIndex(List<SourceRef> sourceRefs) {
        Map<String, SourceRef> index = new HashMap<>();
        for (SourceRef sourceRef : sourceRefs) {
            if (sourceRef.column() != null) {
                index.putIfAbsent(sourceRef.column().toLowerCase(), sourceRef);
            }
            if (sourceRef.table() != null && sourceRef.column() != null) {
                index.putIfAbsent((sourceRef.table() + "." + sourceRef.column()).toLowerCase(), sourceRef);
            }
            if (sourceRef.schema() != null && sourceRef.table() != null && sourceRef.column() != null) {
                index.putIfAbsent((sourceRef.schema() + "." + sourceRef.table() + "." + sourceRef.column()).toLowerCase(), sourceRef);
            }
        }
        return index;
    }

    private static ExpressionNode mapParsedExpression(
            Expression expression,
            List<SourceRef> sourceRefs,
            Map<String, SourceRef> sourceIndex
    ) {
        if (expression instanceof Function function) {
            List<ExpressionNode> args = function.getParameters() == null
                    ? List.of()
                    : function.getParameters().getExpressions().stream()
                            .map(arg -> mapParsedExpression(arg, sourceRefs, sourceIndex))
                            .toList();
            return new ExpressionNode.Function(function.getName(), args);
        }
        if (expression instanceof CaseExpression caseExpression) {
            List<ExpressionNode.WhenThen> whens = new ArrayList<>();
            if (caseExpression.getWhenClauses() != null) {
                for (Expression when : caseExpression.getWhenClauses()) {
                    if (when instanceof WhenClause whenClause) {
                        whens.add(new ExpressionNode.WhenThen(
                                mapParsedExpression(whenClause.getWhenExpression(), sourceRefs, sourceIndex),
                                mapParsedExpression(whenClause.getThenExpression(), sourceRefs, sourceIndex)
                        ));
                    }
                }
            }
            ExpressionNode elseExpr = caseExpression.getElseExpression() == null
                    ? null
                    : mapParsedExpression(caseExpression.getElseExpression(), sourceRefs, sourceIndex);
            return new ExpressionNode.CaseExpr(whens, elseExpr);
        }
        if (expression instanceof CastExpression castExpression) {
            return new ExpressionNode.CastExpr(
                    mapParsedExpression(castExpression.getLeftExpression(), sourceRefs, sourceIndex),
                    castExpression.getColDataType() == null ? "unknown" : castExpression.getColDataType().toString()
            );
        }
        if (expression instanceof BinaryExpression binaryExpression) {
            return new ExpressionNode.Binary(
                    binaryExpression.getStringExpression(),
                    mapParsedExpression(binaryExpression.getLeftExpression(), sourceRefs, sourceIndex),
                    mapParsedExpression(binaryExpression.getRightExpression(), sourceRefs, sourceIndex)
            );
        }
        if (expression instanceof Parenthesis parenthesis) {
            return mapParsedExpression(parenthesis.getExpression(), sourceRefs, sourceIndex);
        }
        if (expression instanceof Column column) {
            SourceRef sourceRef = resolveSourceRef(column, sourceRefs, sourceIndex);
            if (sourceRef != null) {
                return new ExpressionNode.ColumnRef(sourceRef);
            }
            return new ExpressionNode.Literal(column.toString(), "column");
        }
        return new ExpressionNode.Literal(expression.toString(), expression.getClass().getSimpleName().toLowerCase());
    }

    private static SourceRef resolveSourceRef(Column column, List<SourceRef> sourceRefs, Map<String, SourceRef> sourceIndex) {
        String whole = column.getFullyQualifiedName();
        if (whole != null) {
            SourceRef direct = sourceIndex.get(whole.toLowerCase());
            if (direct != null) {
                return direct;
            }
        }
        if (column.getColumnName() != null) {
            SourceRef direct = sourceIndex.get(column.getColumnName().toLowerCase());
            if (direct != null) {
                return direct;
            }
        }
        return sourceRefs.size() == 1 ? sourceRefs.get(0) : null;
    }

    private static List<LineageWarning> mapWarnings(SqlFlowLineageResult result) {
        return result.warnings().stream()
                .map(warning -> new LineageWarning(
                        warning.code(),
                        warning.message(),
                        null,
                        null
                ))
                .toList();
    }

    private static ParseStatus mapStatus(ParseQuality quality) {
        return switch (quality) {
            case COMPLETE -> ParseStatus.COMPLETE;
            case PARTIAL -> ParseStatus.PARTIAL;
            case FAILED -> ParseStatus.FAILED;
        };
    }

    private static List<TableDef> buildMetadataTables(LineageParseRequest request) {
        Statement statement;
        try {
            statement = SqlFlow.sharedParser().createStatement(request.sql());
        } catch (RuntimeException ex) {
            return List.of();
        }

        SchemaCatalog schemaCatalog = request.resolution().schema();
        Map<String, TableDef> tables = new LinkedHashMap<>();
        new AstVisitor<Void, Void>() {
            @Override
            public Void visitTable(Table node, Void context) {
                registerTable(node.getName(), request, schemaCatalog, tables);
                return super.visitTable(node, context);
            }

            @Override
            public Void visitNode(Node node, Void context) {
                for (Node child : node.getChildren()) {
                    process(child, context);
                }
                return null;
            }
        }.process(statement, null);
        return List.copyOf(tables.values());
    }

    private static void registerTable(
            QualifiedName qualifiedName,
            LineageParseRequest request,
            SchemaCatalog schemaCatalog,
            Map<String, TableDef> sink
    ) {
        List<String> parts = qualifiedName.getParts();
        if (parts.isEmpty()) {
            return;
        }

        String catalog = null;
        String schema = null;
        String table = parts.get(parts.size() - 1);
        if (parts.size() == 2) {
            schema = parts.get(0);
        } else if (parts.size() >= 3) {
            catalog = parts.get(parts.size() - 3);
            schema = parts.get(parts.size() - 2);
        }
        if (schema == null || schema.isBlank()) {
            schema = request.database();
        }

        List<String> columnNames = loadColumns(schemaCatalog, request, schema, table);
        if (columnNames.isEmpty()) {
            return;
        }

        String key = (catalog == null ? "" : catalog + ".") + (schema == null ? "" : schema + ".") + table;
        sink.putIfAbsent(key, toTableDef(catalog, schema, table, columnNames));
    }

    private static List<String> loadColumns(
            SchemaCatalog schemaCatalog,
            LineageParseRequest request,
            String schema,
            String table
    ) {
        List<String> columns = schemaCatalog.columns(schema, table);
        if (!columns.isEmpty()) {
            return columns;
        }
        if (schema != null && request.database() != null && !schema.equalsIgnoreCase(request.database())) {
            columns = schemaCatalog.columns(request.database(), table);
            if (!columns.isEmpty()) {
                return columns;
            }
        }
        return schemaCatalog.columns(null, table);
    }

    private static TableDef toTableDef(String catalog, String schema, String table, List<String> columnNames) {
        TableDef tableDef = new TableDef();
        tableDef.setName(table);
        if (schema != null && !schema.isBlank()) {
            tableDef.setSchema(new SchemaDef(schema));
        }
        if (catalog != null && !catalog.isBlank()) {
            tableDef.setCatalog(new CatalogDef(catalog));
        }
        List<ColumnDef> columns = new ArrayList<>();
        for (String columnName : columnNames) {
            columns.add(new ColumnDef(columnName));
        }
        tableDef.setColumns(columns);
        return tableDef;
    }

    private static LineageDialectCompatibility mapCompatibility(SqlFlowLineageResult result) {
        return switch (result.dialectCompatibility()) {
            case FULL -> LineageDialectCompatibility.FULL;
            case PARTIAL -> LineageDialectCompatibility.PARTIAL;
            case LOW -> LineageDialectCompatibility.LOW;
            case UNKNOWN -> LineageDialectCompatibility.UNKNOWN;
        };
    }
}
