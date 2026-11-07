package org.apache.datawise.backend.platform.mcp;

import org.apache.datawise.backend.common.pack.AiAccessGate;
import org.apache.datawise.backend.common.pack.AiTableTagFilter;
import org.apache.datawise.backend.common.pack.AnalysisCanvasRerun;
import org.apache.datawise.backend.common.pack.SemanticMetricQuery;
import org.apache.datawise.backend.connector.api.support.SqlWriteClassifier;
import org.apache.datawise.backend.database.drift.SchemaDriftService;
import org.apache.datawise.backend.database.federated.FederatedSqlGenerator;
import org.apache.datawise.backend.database.sql.SqlService;
import org.apache.datawise.backend.database.table.TableDetailService;
import org.apache.datawise.backend.domain.AiMeterCapabilities;
import org.apache.datawise.backend.domain.ExecuteSqlRequest;
import org.apache.datawise.backend.domain.GenerateFederatedSqlRequest;
import org.apache.datawise.backend.domain.RerunAnalysisCanvasRequest;
import org.apache.datawise.backend.domain.SchemaDriftCompareRequest;
import org.apache.datawise.backend.domain.SchemaTableSummary;
import org.apache.datawise.backend.domain.SchemaTablesResult;
import org.apache.datawise.backend.domain.SqlReviewRequest;
import org.apache.datawise.backend.domain.UserFeaturePermission;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.apache.datawise.backend.platform.mcp.confirm.ConfirmGateService;
import org.apache.datawise.backend.platform.mcp.confirm.ConfirmTicket;
import org.apache.datawise.backend.platform.sql.SqlReviewOrchestrator;
import org.apache.datawise.backend.platform.workbenchcontext.WorkbenchContextSnapshot;
import org.apache.datawise.backend.platform.workbenchcontext.WorkbenchContextStore;
import org.apache.datawise.backend.security.HeadlessSqlAuth;
import org.apache.datawise.backend.security.UserContext;
import org.apache.datawise.backend.service.ConnectionVisibilityService;
import org.apache.datawise.backend.service.FeaturePermissionAccess;
import org.apache.datawise.backend.service.ProductionWriteGuardService;
import org.apache.datawise.backend.service.tenant.TenantQuotaService;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@Service
@Profile("!without-ai")
public class McpBridgeService {

    private final ConnectionVisibilityService connectionVisibilityService;
    private final TableDetailService tableDetailService;
    private final SqlService sqlService;
    private final SqlReviewOrchestrator sqlReviewOrchestrator;
    private final SchemaDriftService schemaDriftService;
    private final AiTableTagFilter tableTagFilter;
    private final SemanticMetricQuery semanticMetricQuery;
    private final AnalysisCanvasRerun analysisCanvasRerun;
    private final FederatedSqlGenerator federatedSqlGenerator;
    private final AiAccessGate aiAccessGate;
    private final TenantQuotaService tenantQuotaService;
    private final WorkbenchContextStore workbenchContextStore;
    private final ConfirmGateService confirmGateService;
    private final FeaturePermissionAccess featurePermissionAccess;
    private final ProductionWriteGuardService productionWriteGuardService;

    public McpBridgeService(
            ConnectionVisibilityService connectionVisibilityService,
            TableDetailService tableDetailService,
            SqlService sqlService,
            SqlReviewOrchestrator sqlReviewOrchestrator,
            SchemaDriftService schemaDriftService,
            AiTableTagFilter tableTagFilter,
            SemanticMetricQuery semanticMetricQuery,
            AnalysisCanvasRerun analysisCanvasRerun,
            FederatedSqlGenerator federatedSqlGenerator,
            AiAccessGate aiAccessGate,
            TenantQuotaService tenantQuotaService,
            WorkbenchContextStore workbenchContextStore,
            ConfirmGateService confirmGateService,
            FeaturePermissionAccess featurePermissionAccess,
            ProductionWriteGuardService productionWriteGuardService
    ) {
        this.connectionVisibilityService = connectionVisibilityService;
        this.tableDetailService = tableDetailService;
        this.sqlService = sqlService;
        this.sqlReviewOrchestrator = sqlReviewOrchestrator;
        this.schemaDriftService = schemaDriftService;
        this.tableTagFilter = tableTagFilter;
        this.semanticMetricQuery = semanticMetricQuery;
        this.analysisCanvasRerun = analysisCanvasRerun;
        this.federatedSqlGenerator = federatedSqlGenerator;
        this.aiAccessGate = aiAccessGate;
        this.tenantQuotaService = tenantQuotaService;
        this.workbenchContextStore = workbenchContextStore;
        this.confirmGateService = confirmGateService;
        this.featurePermissionAccess = featurePermissionAccess;
        this.productionWriteGuardService = productionWriteGuardService;
    }

    public record McpInvokeRequest(String tool, Map<String, Object> arguments) {
    }

    public List<Map<String, Object>> listTools() {
        return List.of(
                tool("get_workbench_context",
                        "Read the user's live DataWise UI focus (connection, open tabs, editor preview)",
                        "includeBodyPreview"),
                tool("list_connections", "List visible database connections"),
                tool("list_tables", "List tables for a connection/database", "connectionId", "database"),
                tool("review_sql", "Review SQL before execution", "sql", "connectionId", "database"),
                tool("execute_readonly_sql", "Execute read-only SELECT SQL", "sql", "connectionId", "database", "maxRows"),
                tool("compare_schema", "Compare schema drift between environments",
                        "sourceConnectionId", "sourceDatabase", "targetConnectionId", "targetDatabase"),
                tool("list_semantic_metrics", "List semantic layer metrics for a database",
                        "connectionId", "database"),
                tool("rerun_canvas", "Rerun an analysis canvas with parameter values",
                        "canvasId", "parameterValues"),
                tool("generate_federated_sql", "Generate cross-source federated SQL from natural language",
                        "prompt", "sources"),
                tool("propose_open_console",
                        "Propose opening a SQL console tab with optional SQL (requires DataWise UI confirm)",
                        "connectionId", "database", "sql", "title")
        );
    }

    public Object invoke(McpInvokeRequest request) {
        if (request.tool() == null || request.tool().isBlank()) {
            throw new IllegalArgumentException("tool is required");
        }
        Map<String, Object> args = request.arguments() != null ? request.arguments() : Map.of();
        return switch (request.tool()) {
            case "get_workbench_context" -> getWorkbenchContext(args);
            case "list_connections" -> listConnections();
            case "list_tables" -> listTables(
                    stringArg(args, "connectionId"),
                    stringArg(args, "database")
            );
            case "review_sql" -> reviewSql(new SqlReviewRequest(
                    stringArg(args, "sql"),
                    stringArg(args, "connectionId"),
                    optionalString(args, "database")
            ));
            case "execute_readonly_sql" -> executeReadonly(new ExecuteSqlRequest(
                    stringArg(args, "sql"),
                    stringArg(args, "connectionId"),
                    optionalString(args, "database"),
                    intArg(args, "maxRows", 200),
                    null,
                    null,
                    null,
                    "mcp"
            ));
            case "compare_schema" -> compareSchema(new SchemaDriftCompareRequest(
                    stringArg(args, "sourceConnectionId"),
                    optionalString(args, "sourceDatabase"),
                    stringArg(args, "targetConnectionId"),
                    optionalString(args, "targetDatabase"),
                    optionalString(args, "tablePattern")
            ));
            case "list_semantic_metrics" -> listSemanticMetrics(
                    stringArg(args, "connectionId"),
                    stringArg(args, "database")
            );
            case "rerun_canvas" -> rerunCanvas(
                    stringArg(args, "canvasId"),
                    args.get("parameterValues")
            );
            case "generate_federated_sql" -> generateFederatedSql(args);
            case "propose_open_console" -> proposeOpenConsole(args);
            default -> throw new IllegalArgumentException("unknown tool: " + request.tool());
        };
    }

    public Map<String, Object> proposeOpenConsole(Map<String, Object> args) {
        requireMcpSqlSession();
        featurePermissionAccess.requirePermission(UserFeaturePermission.WORKBENCH_TAB_NEW);
        String connectionId = optionalString(args, "connectionId");
        String database = optionalString(args, "database");
        String sql = optionalString(args, "sql");
        String title = optionalString(args, "title");

        if ((connectionId == null || connectionId.isBlank()) && (sql == null || sql.isBlank())) {
            WorkbenchContextSnapshot focus = workbenchContextStore.get(
                    UserContext.requireUserId(),
                    UserContext.getTenantId(),
                    false
            );
            if (focus.online() && focus.focus() != null) {
                if (connectionId == null || connectionId.isBlank()) {
                    connectionId = focus.focus().connectionId();
                }
                if (database == null || database.isBlank()) {
                    database = focus.focus().database();
                }
            }
        }

        boolean writeSql = sql != null && SqlWriteClassifier.requiresWriteAccess(sql);
        boolean needsProdApproval = false;
        if (writeSql && connectionId != null && !connectionId.isBlank()) {
            Optional<ConnectionEntity> connection =
                    connectionVisibilityService.resolveConnectionEntity(connectionId);
            if (connection.isPresent()) {
                needsProdApproval = productionWriteGuardService.requiresProductionApproval(
                        UserContext.requireUserId(),
                        connection.get(),
                        sql
                );
            }
        }

        Map<String, Object> preview = new LinkedHashMap<>();
        preview.put("tool", "propose_open_console");
        if (connectionId != null) {
            preview.put("connectionId", connectionId);
        }
        if (database != null) {
            preview.put("database", database);
        }
        if (sql != null) {
            preview.put("sql", sql.length() > 2000 ? sql.substring(0, 2000) + "…" : sql);
        }
        if (title != null) {
            preview.put("title", title);
        }
        if (needsProdApproval) {
            preview.put("review", Map.of(
                    "requiresApproval", true,
                    "code", "PROD_APPROVAL"
            ));
        }

        Map<String, Object> execution = new LinkedHashMap<>();
        execution.put("type", "open_console");
        if (connectionId != null) {
            execution.put("connectionId", connectionId);
        }
        if (database != null) {
            execution.put("database", database);
        }
        if (sql != null) {
            execution.put("sql", sql);
        }
        if (title != null) {
            execution.put("title", title);
        }
        if (needsProdApproval) {
            execution.put("requiresApproval", true);
        }

        String risk = needsProdApproval
                ? ConfirmTicket.RISK_PROD_APPROVAL
                : (writeSql ? ConfirmTicket.RISK_WRITE : ConfirmTicket.RISK_SESSION);

        String summary = needsProdApproval
                ? ("Submit production SQL approval"
                + (connectionId != null ? " on " + connectionId : "")
                + (sql != null ? " (write SQL)" : ""))
                : ("Open SQL console"
                + (connectionId != null ? " on " + connectionId : "")
                + (sql != null ? " with proposed SQL" : ""));

        return confirmGateService.propose(
                "propose_open_console",
                risk,
                summary,
                preview,
                execution
        );
    }

    public WorkbenchContextSnapshot getWorkbenchContext(Map<String, Object> args) {
        requireMcpCatalogAccess();
        boolean includeBody = true;
        Object raw = args.get("includeBodyPreview");
        if (raw instanceof Boolean bool) {
            includeBody = bool;
        } else if (raw != null) {
            includeBody = Boolean.parseBoolean(String.valueOf(raw));
        }
        long userId = UserContext.requireUserId();
        return workbenchContextStore.get(userId, UserContext.getTenantId(), includeBody);
    }

    public List<Map<String, String>> listConnections() {
        requireMcpCatalogAccess();
        return connectionVisibilityService.visibleCatalogForCurrentUser().connections().stream()
                .map(this::toConnectionSummary)
                .toList();
    }

    public List<String> listTables(String connectionId, String database) {
        requireMcpCatalogAccess();
        SchemaTablesResult result = tableDetailService.loadSchemaTables(connectionId, database);
        List<String> allTables = result.tables().stream().map(SchemaTableSummary::tableName).toList();
        return tableTagFilter.filterTaggedTables(connectionId, database, allTables);
    }

    public Object reviewSql(SqlReviewRequest request) {
        requireMcpSqlSession();
        featurePermissionAccess.requirePermission(UserFeaturePermission.WORKBENCH_CONSOLE_RUN);
        return sqlReviewOrchestrator.review(request);
    }

    public Object executeReadonly(ExecuteSqlRequest request) {
        requireMcpSqlSession();
        featurePermissionAccess.requireSqlExecute(request.sql());
        if (SqlWriteClassifier.requiresWriteAccess(request.sql())) {
            throw new IllegalArgumentException("Only read-only SQL is allowed via MCP");
        }
        var review = sqlReviewOrchestrator.review(new SqlReviewRequest(
                request.sql(),
                request.connectionId(),
                request.database(),
                false
        ));
        if (!review.allowed()) {
            throw new IllegalArgumentException("SQL blocked by review: " + review.findings());
        }
        return sqlService.execute(request);
    }

    public Object compareSchema(SchemaDriftCompareRequest request) {
        requireMcpCatalogAccess();
        return schemaDriftService.compare(request);
    }

    public Object listSemanticMetrics(String connectionId, String database) {
        requireMcpCatalogAccess();
        aiAccessGate.requireAiPack();
        return semanticMetricQuery.list(connectionId, database);
    }

    public Object rerunCanvas(String canvasId, Object parameterValuesRaw) {
        requireMcpSqlSession();
        featurePermissionAccess.requirePermission(UserFeaturePermission.WORKBENCH_CONSOLE_RUN);
        aiAccessGate.requireAiPack();
        tenantQuotaService.requireAiCallQuota(AiMeterCapabilities.CANVAS_RERUN);
        Map<String, String> values = Map.of();
        if (parameterValuesRaw instanceof Map<?, ?> raw) {
            values = new LinkedHashMap<>();
            for (Map.Entry<?, ?> entry : raw.entrySet()) {
                if (entry.getKey() != null && entry.getValue() != null) {
                    values.put(String.valueOf(entry.getKey()), String.valueOf(entry.getValue()));
                }
            }
        }
        return analysisCanvasRerun.rerun(new RerunAnalysisCanvasRequest(canvasId, values));
    }

    @SuppressWarnings("unchecked")
    public Object generateFederatedSql(Map<String, Object> args) {
        requireMcpSqlSession();
        featurePermissionAccess.requirePermission(UserFeaturePermission.WORKBENCH_CONSOLE_AI);
        aiAccessGate.requireAiPack();
        tenantQuotaService.requireAiCallQuota(AiMeterCapabilities.FEDERATED_SQL);
        String prompt = stringArg(args, "prompt");
        Object sourcesRaw = args.get("sources");
        if (!(sourcesRaw instanceof List<?> list) || list.size() < 2) {
            throw new IllegalArgumentException("sources must be an array with at least two entries");
        }
        List<org.apache.datawise.backend.model.FederatedViewSource> sources = new java.util.ArrayList<>();
        for (Object item : list) {
            if (!(item instanceof Map<?, ?> map)) {
                continue;
            }
            org.apache.datawise.backend.model.FederatedViewSource source =
                    new org.apache.datawise.backend.model.FederatedViewSource();
            source.setAlias(stringArg((Map<String, Object>) map, "alias"));
            source.setConnectionId(stringArg((Map<String, Object>) map, "connectionId"));
            Object database = map.get("database");
            if (database != null) {
                source.setDatabase(String.valueOf(database));
            }
            sources.add(source);
        }
        return federatedSqlGenerator.generate(new GenerateFederatedSqlRequest(prompt, sources));
    }

    /**
     * Session callers must match desktop feature permissions; API tokens keep the SQL scope gate.
     */
    private void requireMcpSqlSession() {
        HeadlessSqlAuth.requireSqlAccess();
    }

    private void requireMcpCatalogAccess() {
        HeadlessSqlAuth.requireSqlAccess();
        featurePermissionAccess.requirePermission(UserFeaturePermission.NAV_DATABASE);
    }

    private Map<String, String> toConnectionSummary(ConnectionEntity connection) {
        Map<String, String> row = new LinkedHashMap<>();
        row.put("id", connection.getId());
        row.put("name", connection.getName());
        row.put("dbType", connection.getDbType());
        row.put("env", connection.getEnv());
        return row;
    }

    private static Map<String, Object> tool(String name, String description, String... params) {
        Map<String, Object> tool = new LinkedHashMap<>();
        tool.put("name", name);
        tool.put("description", description);
        tool.put("parameters", List.of(params));
        return tool;
    }

    private static String stringArg(Map<String, Object> args, String key) {
        Object value = args.get(key);
        if (value == null) {
            throw new IllegalArgumentException(key + " is required");
        }
        String text = String.valueOf(value).trim();
        if (text.isEmpty()) {
            throw new IllegalArgumentException(key + " is required");
        }
        return text;
    }

    private static String optionalString(Map<String, Object> args, String key) {
        Object value = args.get(key);
        if (value == null) {
            return null;
        }
        String text = String.valueOf(value).trim();
        return text.isEmpty() ? null : text;
    }

    private static int intArg(Map<String, Object> args, String key, int defaultValue) {
        Object value = args.get(key);
        if (value == null) {
            return defaultValue;
        }
        if (value instanceof Number number) {
            return number.intValue();
        }
        return Integer.parseInt(String.valueOf(value));
    }
}
