package org.apache.datawise.backend.lineage.parser.jsqlparser;

import net.sf.jsqlparser.JSQLParserException;
import net.sf.jsqlparser.expression.Expression;
import net.sf.jsqlparser.parser.CCJSqlParserUtil;
import org.apache.datawise.backend.database.federated.FederatedJoinSqlParser;
import org.apache.datawise.backend.database.federated.FederatedJoinSqlParser.FederatedJoinPlan;
import org.apache.datawise.backend.database.federated.FederatedJoinSqlParser.FederatedJoinStep;
import org.apache.datawise.backend.database.federated.FederatedSqlSubquerySupport;
import org.apache.datawise.backend.domain.LineageDialectCompatibility;
import org.apache.datawise.backend.lineage.model.ColumnLineage;
import org.apache.datawise.backend.lineage.model.FederatedLineageSource;
import org.apache.datawise.backend.lineage.model.LineageParseRequest;
import org.apache.datawise.backend.lineage.model.LineageParseResult;
import org.apache.datawise.backend.lineage.model.LineageWarning;
import org.apache.datawise.backend.lineage.model.ParseStatus;
import org.apache.datawise.backend.lineage.spi.SqlLineageParser;
import org.apache.datawise.backend.lineage.spi.SqlLineageParserRegistry;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Component
public class FederatedLineageParser implements SqlLineageParser {

    private static final String ENGINE_ID = "federated";
    private static final String ENGINE_VERSION = "1.0";

    private static final Pattern SOURCE_REF = Pattern.compile("@([a-zA-Z][\\w]*)");
    private static final Pattern JOIN_REF = Pattern.compile("\\bJOIN\\b", Pattern.CASE_INSENSITIVE);
    private static final Pattern SELECT_ITEM_ALIAS = Pattern.compile("(?is)^(.+?)\\s+AS\\s+([\\w`\"]+)$");

    private final SqlLineageParserRegistry parserRegistry;

    public FederatedLineageParser(@Lazy SqlLineageParserRegistry parserRegistry) {
        this.parserRegistry = parserRegistry;
    }

    @Override
    public boolean supports(String dbType) {
        return true;
    }

    @Override
    public int priority() {
        return 80;
    }

    @Override
    public String engineId() {
        return ENGINE_ID;
    }

    @Override
    public String engineVersion() {
        return ENGINE_VERSION;
    }

    @Override
    public LineageParseResult parse(LineageParseRequest request) {
        String sql = request.sql();
        if (sql == null || sql.isBlank()) {
            return LineageParseResult.failed(ENGINE_ID, ENGINE_VERSION, "SQL is required");
        }
        if (!containsFederatedMarker(sql)) {
            return LineageParseResult.failed(ENGINE_ID, ENGINE_VERSION, "Not a federated @alias SQL");
        }
        List<LineageWarning> warnings = new ArrayList<>();
        try {
            List<ColumnLineage> columns;
            if (containsJoin(sql)) {
                columns = parseJoinSql(request, warnings);
            } else {
                columns = parseSingleSourceSql(request, warnings);
            }
            ParseStatus status = warnings.isEmpty() ? ParseStatus.COMPLETE : ParseStatus.PARTIAL;
            return new LineageParseResult(
                    columns,
                    warnings,
                    status,
                    ENGINE_ID,
                    ENGINE_VERSION,
                    LineageDialectCompatibility.UNKNOWN
            );
        } catch (IllegalArgumentException | JSQLParserException ex) {
            return LineageParseResult.failed(ENGINE_ID, ENGINE_VERSION, ex.getMessage());
        }
    }

    private List<ColumnLineage> parseJoinSql(LineageParseRequest request, List<LineageWarning> warnings)
            throws JSQLParserException {
        FederatedJoinPlan plan = FederatedJoinSqlParser.parse(request.sql());
        JsqlLineageVisitorContext context = new JsqlLineageVisitorContext(
                request.connectionId(),
                request.database(),
                warnings
        );
        context.pushScope();
        JsqlScopeContext scope = new JsqlScopeContext(context);
        for (FederatedJoinStep step : plan.steps()) {
            List<ColumnLineage> stepColumns = parseStepSubquery(step, request, warnings);
            scope.registerDerivedRelation(JsqlRelationBinding.Kind.SUBQUERY, step.tableAlias(), stepColumns);
        }
        return extractOuterColumns(plan.selectItems(), scope, context, request);
    }

    private List<ColumnLineage> parseSingleSourceSql(LineageParseRequest request, List<LineageWarning> warnings)
            throws JSQLParserException {
        Matcher matcher = SOURCE_REF.matcher(request.sql());
        if (!matcher.find()) {
            throw new IllegalArgumentException("federated SQL must include @alias marker");
        }
        String sourceAlias = matcher.group(1);
        String subQuery = FederatedSqlSubquerySupport.extractSubQuery(request.sql(), sourceAlias);
        if (subQuery == null || subQuery.isBlank()) {
            warnings.add(LineageWarning.of(
                    "UNSUPPORTED_SYNTAX",
                    "Unable to extract subquery for @" + sourceAlias
            ));
            return List.of();
        }
        String tableAlias = resolveTableAlias(request.sql(), sourceAlias);
        FederatedJoinStep step = new FederatedJoinStep(sourceAlias, tableAlias, subQuery, null);
        List<ColumnLineage> stepColumns = parseStepSubquery(step, request, warnings);

        String selectClause = extractSelectClause(request.sql());
        if (selectClause == null) {
            return stepColumns;
        }
        JsqlLineageVisitorContext context = new JsqlLineageVisitorContext(
                request.connectionId(),
                request.database(),
                warnings
        );
        context.pushScope();
        JsqlScopeContext scope = new JsqlScopeContext(context);
        scope.registerDerivedRelation(JsqlRelationBinding.Kind.SUBQUERY, tableAlias, stepColumns);
        return extractOuterColumns(parseSelectItems(selectClause), scope, context, request);
    }

    private List<ColumnLineage> parseStepSubquery(
            FederatedJoinStep step,
            LineageParseRequest request,
            List<LineageWarning> warnings
    ) {
        FederatedLineageSource source = resolveSource(step.sourceAlias(), request);
        LineageParseRequest childRequest = new LineageParseRequest(
                step.subQuery(),
                source.dbType() != null && !source.dbType().isBlank() ? source.dbType() : request.dbType(),
                source.connectionId(),
                source.database(),
                source.database(),
                step.sourceAlias(),
                request.maxDepth(),
                request.visitedModels(),
                request.resolution()
        );
        LineageParseResult childResult = parserRegistry.parseWithFallback(childRequest);
        warnings.addAll(childResult.warnings());
        if (childResult.status() == ParseStatus.FAILED || childResult.columns().isEmpty()) {
            warnings.add(LineageWarning.of(
                    "FEDERATED_SOURCE_PARSE_FAILED",
                    "Failed to parse federated source @" + step.sourceAlias()
            ));
            return List.of();
        }
        return childResult.columns();
    }

    private List<ColumnLineage> extractOuterColumns(
            List<String> selectItems,
            JsqlScopeContext scope,
            JsqlLineageVisitorContext context,
            LineageParseRequest request
    ) throws JSQLParserException {
        JsqlExpressionLineageExtractor extractor = new JsqlExpressionLineageExtractor(
                request.connectionId(),
                request.database(),
                scope,
                context.warnings()
        );
        List<ColumnLineage> columns = new ArrayList<>();
        for (String selectItem : selectItems) {
            if ("*".equals(selectItem)) {
                context.warnings().add(LineageWarning.of(
                        "UNSUPPORTED_SYNTAX",
                        "SELECT * is not supported in federated outer SELECT"
                ));
                continue;
            }
            ParsedSelectItem parsed = parseSelectItemText(selectItem);
            Expression expression = CCJSqlParserUtil.parseExpression(parsed.expression());
            JsqlExpressionLineageExtractor.Extraction extraction = extractor.extract(expression);
            columns.add(new ColumnLineage(
                    parsed.outputColumn(),
                    extraction.sources(),
                    extraction.expressionTree()
            ));
        }
        context.popScope();
        return columns;
    }

    private static ParsedSelectItem parseSelectItemText(String selectItem) throws JSQLParserException {
        String trimmed = selectItem.trim();
        Matcher aliasMatcher = SELECT_ITEM_ALIAS.matcher(trimmed);
        if (aliasMatcher.matches()) {
            String expression = aliasMatcher.group(1).trim();
            String alias = stripQuotes(aliasMatcher.group(2));
            return new ParsedSelectItem(expression, alias);
        }
        Expression expression = CCJSqlParserUtil.parseExpression(trimmed);
        return new ParsedSelectItem(trimmed, JsqlExpressionLineageExtractor.outputColumnName(expression, null));
    }

    private static List<String> parseSelectItems(String selectClause) {
        if (selectClause == null || selectClause.isBlank()) {
            return List.of();
        }
        if ("*".equals(selectClause.trim())) {
            return List.of("*");
        }
        List<String> items = new ArrayList<>();
        StringBuilder current = new StringBuilder();
        int depth = 0;
        for (int i = 0; i < selectClause.length(); i++) {
            char ch = selectClause.charAt(i);
            if (ch == '(') {
                depth++;
            } else if (ch == ')') {
                depth = Math.max(0, depth - 1);
            } else if (ch == ',' && depth == 0) {
                addItem(items, current);
                current = new StringBuilder();
                continue;
            }
            current.append(ch);
        }
        addItem(items, current);
        return items;
    }

    private static void addItem(List<String> items, StringBuilder current) {
        String item = current.toString().trim();
        if (!item.isEmpty()) {
            items.add(item);
        }
    }

    private static String extractSelectClause(String sql) {
        Matcher matcher = Pattern.compile("(?is)\\bSELECT\\s+(.+?)\\s+FROM\\s+").matcher(sql.trim());
        if (!matcher.find()) {
            return null;
        }
        return matcher.group(1).trim();
    }

    private static String resolveTableAlias(String sql, String sourceAlias) {
        Matcher matcher = Pattern.compile(
                "@\\Q" + sourceAlias + "\\E\\s+([a-zA-Z]\\w*)"
        ).matcher(sql);
        if (matcher.find()) {
            return matcher.group(1);
        }
        return sourceAlias;
    }

    private static FederatedLineageSource resolveSource(String alias, LineageParseRequest request) {
        for (FederatedLineageSource source : request.federatedSources()) {
            if (source.alias() != null && source.alias().equalsIgnoreCase(alias)) {
                return source;
            }
        }
        return new FederatedLineageSource(
                alias,
                request.connectionId(),
                request.database(),
                request.dbType()
        );
    }

    private static boolean containsFederatedMarker(String sql) {
        return sql != null && SOURCE_REF.matcher(sql).find();
    }

    private static boolean containsJoin(String sql) {
        return sql != null && JOIN_REF.matcher(sql).find();
    }

    private static String stripQuotes(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        if ((trimmed.startsWith("`") && trimmed.endsWith("`"))
                || (trimmed.startsWith("\"") && trimmed.endsWith("\""))) {
            return trimmed.substring(1, trimmed.length() - 1);
        }
        return trimmed;
    }

    private record ParsedSelectItem(String expression, String outputColumn) {
    }
}
