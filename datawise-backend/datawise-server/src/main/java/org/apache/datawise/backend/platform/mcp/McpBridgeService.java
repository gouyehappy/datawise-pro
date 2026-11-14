package org.apache.datawise.backend.platform.mcp;

import org.apache.datawise.backend.ai.schema.AiSchemaContextService;
import org.apache.datawise.backend.ai.schema.AiSqlSchemaContext;
import org.apache.datawise.backend.ai.schema.AiTableDdlSnippet;
import org.apache.datawise.backend.ai.schema.AiTableRelationService;
import org.apache.datawise.backend.ai.support.AiSqlSafetyChecker;
import org.apache.datawise.backend.ai.support.AiSqlSemanticChecker;
import org.apache.datawise.backend.common.truncation.TextTruncation;
import org.apache.datawise.backend.common.pack.AiAccessGate;
import org.apache.datawise.backend.common.pack.AiTableTagFilter;
import org.apache.datawise.backend.common.pack.AnalysisCanvasRerun;
import org.apache.datawise.backend.common.pack.SemanticMetricQuery;
import org.apache.datawise.backend.connector.api.support.SqlWriteClassifier;
import org.apache.datawise.backend.connector.facade.ConnectorFacade;
import org.apache.datawise.backend.jdbc.support.SqlExecutionTracker;
import org.apache.datawise.backend.database.drift.SchemaDriftService;
import org.apache.datawise.backend.database.federated.FederatedSqlGenerator;
import org.apache.datawise.backend.database.sql.SqlService;
import org.apache.datawise.backend.database.table.TableDataService;
import org.apache.datawise.backend.database.table.TableDetailService;
import org.apache.datawise.backend.domain.AiMeterCapabilities;
import org.apache.datawise.backend.domain.ExecuteSqlRequest;
import org.apache.datawise.backend.domain.ExecuteSqlResult;
import org.apache.datawise.backend.domain.GenerateFederatedSqlRequest;
import org.apache.datawise.backend.domain.RerunAnalysisCanvasRequest;
import org.apache.datawise.backend.domain.SchemaDriftCompareRequest;
import org.apache.datawise.backend.domain.SchemaTableSummary;
import org.apache.datawise.backend.domain.SchemaTablesResult;
import org.apache.datawise.backend.domain.SqlReviewRequest;
import org.apache.datawise.backend.domain.TableDataResult;
import org.apache.datawise.backend.domain.TableDdlResult;
import org.apache.datawise.backend.domain.UserFeaturePermission;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.apache.datawise.backend.platform.mcp.audit.McpCallAuditEntry;
import org.apache.datawise.backend.platform.mcp.audit.McpCallAuditService;
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
import org.apache.datawise.sqlparser.ExplainSqlSupport;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
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
    private final McpAccessPolicyService accessPolicyService;
    private final McpCallAuditService callAuditService;
    private final TableDataService tableDataService;
    private final AiSchemaContextService aiSchemaContextService;
    private final AiTableRelationService aiTableRelationService;
    private final ConnectorFacade connectorFacade;

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
            ProductionWriteGuardService productionWriteGuardService,
            McpAccessPolicyService accessPolicyService,
            McpCallAuditService callAuditService,
            TableDataService tableDataService,
            AiSchemaContextService aiSchemaContextService,
            AiTableRelationService aiTableRelationService,
            ConnectorFacade connectorFacade
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
        this.accessPolicyService = accessPolicyService;
        this.callAuditService = callAuditService;
        this.tableDataService = tableDataService;
        this.aiSchemaContextService = aiSchemaContextService;
        this.aiTableRelationService = aiTableRelationService;
        this.connectorFacade = connectorFacade;
    }

    public record McpInvokeRequest(String tool, Map<String, Object> arguments) {
    }

    public List<Map<String, Object>> listTools() {
        return McpToolCatalog.all().stream().map(McpToolSpec::toWireMap).toList();
    }

    public Object invoke(McpInvokeRequest request) {
        if (request.tool() == null || request.tool().isBlank()) {
            throw new IllegalArgumentException("tool is required");
        }
        String toolName = request.tool().trim();
        Map<String, Object> args = request.arguments() != null ? request.arguments() : Map.of();
        String callId = callAuditService.newCallId();
        long started = System.currentTimeMillis();
        String status = McpCallAuditEntry.STATUS_OK;
        String error = null;
        try {
            McpToolSpec spec = McpToolCatalog.require(toolName);
            accessPolicyService.current().ensureToolAllowed(spec);
            if (spec.requiredFeature() != null && !spec.requiredFeature().isBlank()) {
                featurePermissionAccess.requirePermission(spec.requiredFeature());
            }
            return dispatchTool(toolName, args);
        } catch (IllegalArgumentException ex) {
            status = messageLooksLikePolicyDeny(ex.getMessage())
                    ? McpCallAuditEntry.STATUS_DENIED
                    : McpCallAuditEntry.STATUS_ERROR;
            error = ex.getMessage();
            throw ex;
        } catch (RuntimeException ex) {
            status = Thread.currentThread().isInterrupted()
                    ? McpCallAuditEntry.STATUS_CANCELLED
                    : McpCallAuditEntry.STATUS_ERROR;
            error = ex.getMessage();
            throw ex;
        } finally {
            callAuditService.record(
                    callId,
                    toolName,
                    status,
                    McpCallAuditService.summarizeArgs(args),
                    System.currentTimeMillis() - started,
                    error
            );
        }
    }

    private Object dispatchTool(String toolName, Map<String, Object> args) {
        return switch (toolName) {
            case "get_workbench_context" -> getWorkbenchContext(args);
            case "list_connections" -> listConnections();
            case "list_tables" -> listTables(
                    stringArg(args, "connectionId"),
                    stringArg(args, "database")
            );
            case "describe_table" -> describeTable(args);
            case "get_schema_context" -> getSchemaContext(args);
            case "get_sample_data" -> getSampleData(args);
            case "explain_query" -> explainQuery(args);
            case "review_sql" -> reviewSql(new SqlReviewRequest(
                    stringArg(args, "sql"),
                    stringArg(args, "connectionId"),
                    optionalString(args, "database")
            ));
            case "validate_sql" -> validateSql(args);
            case "list_relations" -> listRelations(args);
            case "query_status" -> queryStatus(args);
            case "cancel_query" -> cancelQuery(args);
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
            case "get_access_policy" -> accessPolicyService.currentAsMap();
            case "set_access_policy" -> setAccessPolicy(args);
            case "get_call_history" -> callAuditService.listRecent(intArg(args, "limit", 50));
            default -> throw new IllegalArgumentException("unknown tool: " + toolName);
        };
    }

    private Map<String, Object> setAccessPolicy(Map<String, Object> args) {
        String tenantId = UserContext.requireTenantId();
        McpAccessPolicy current = accessPolicyService.get(tenantId);
        boolean readOnly = args.containsKey("readOnly")
                ? Boolean.parseBoolean(String.valueOf(args.get("readOnly")))
                : current.readOnly();
        boolean allowDangerous = args.containsKey("allowDangerousSql")
                ? Boolean.parseBoolean(String.valueOf(args.get("allowDangerousSql")))
                : current.allowDangerousSql();
        java.util.Set<String> allowed = current.allowedToolNames();
        if (args.containsKey("allowedToolNames")) {
            List<String> names = stringListArg(args.get("allowedToolNames"));
            allowed = names == null ? java.util.Set.of() : java.util.Set.copyOf(names);
        }
        McpAccessPolicy next = new McpAccessPolicy(
                readOnly,
                allowDangerous,
                allowed,
                tenantId,
                current.connectionId(),
                current.database()
        );
        accessPolicyService.put(tenantId, next);
        return accessPolicyService.currentAsMap();
    }

    private static boolean messageLooksLikePolicyDeny(String message) {
        if (message == null) {
            return false;
        }
        String lower = message.toLowerCase();
        return lower.contains("access policy")
                || lower.contains("read-only mcp")
                || lower.contains("dangerous tool blocked")
                || lower.contains("permission denied");
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
            TextTruncation.TruncatedText sqlPreview = TextTruncation.truncateCharsForPreview(
                    sql, TextTruncation.MCP_PREVIEW_SQL_MAX_CHARS, "preview");
            preview.put("sql", sqlPreview.text());
            preview.put("sqlTruncation", sqlPreview.meta().toMap());
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

    public Map<String, Object> describeTable(Map<String, Object> args) {
        requireMcpCatalogAccess();
        String connectionId = stringArg(args, "connectionId");
        String database = stringArg(args, "database");
        String tableName = stringArg(args, "tableName");
        TableDdlResult ddl = tableDetailService.loadDdl(tableName, connectionId, database);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("connectionId", connectionId);
        out.put("database", database);
        out.put("tableName", tableName);
        out.put("ddl", ddl.ddl() == null ? "" : ddl.ddl());
        return out;
    }

    public Map<String, Object> getSchemaContext(Map<String, Object> args) {
        requireMcpCatalogAccess();
        aiAccessGate.requireAiPack();
        String connectionId = stringArg(args, "connectionId");
        String database = stringArg(args, "database");
        String prompt = optionalString(args, "prompt");
        List<String> tableNames = stringListArg(args.get("tableNames"));
        AiSqlSchemaContext context;
        if (tableNames != null && !tableNames.isEmpty()) {
            context = aiSchemaContextService.buildForTables(connectionId, database, tableNames, null);
        } else {
            context = aiSchemaContextService.build(
                    connectionId,
                    database,
                    prompt == null ? "" : prompt,
                    null
            );
        }
        return schemaContextToMap(context);
    }

    public Map<String, Object> getSampleData(Map<String, Object> args) {
        requireMcpCatalogAccess();
        String connectionId = stringArg(args, "connectionId");
        String database = stringArg(args, "database");
        String tableName = stringArg(args, "tableName");
        int maxRows = Math.min(Math.max(1, intArg(args, "maxRows", 20)), 50);
        TableDataResult data = tableDataService.fetch(tableName, connectionId, database, maxRows);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("connectionId", connectionId);
        out.put("database", database);
        out.put("tableName", tableName);
        out.put("maxRows", maxRows);
        out.put("columns", data.columns());
        out.put("rows", data.rows());
        out.put("hasMore", data.hasMore());
        return out;
    }

    public Map<String, Object> explainQuery(Map<String, Object> args) {
        requireMcpSqlSession();
        featurePermissionAccess.requirePermission(UserFeaturePermission.WORKBENCH_CONSOLE_EXPLAIN);
        String connectionId = stringArg(args, "connectionId");
        String database = optionalString(args, "database");
        String sql = stringArg(args, "sql");
        if (SqlWriteClassifier.requiresWriteAccess(sql)) {
            throw new IllegalArgumentException("Only read-only SQL can be explained via MCP");
        }
        ConnectionEntity connection = connectionVisibilityService.resolveConnectionEntity(connectionId)
                .orElseThrow(() -> new IllegalArgumentException("connection not found: " + connectionId));
        String explainSql = ExplainSqlSupport.wrapExplain(sql, connection.getDbType());
        if (explainSql == null) {
            throw new IllegalArgumentException(
                    "EXPLAIN is not supported for dbType=" + connection.getDbType()
            );
        }
        ExecuteSqlResult result = sqlService.execute(new ExecuteSqlRequest(
                explainSql,
                connectionId,
                database,
                200,
                null,
                null,
                null,
                "mcp-explain"
        ));
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("connectionId", connectionId);
        out.put("database", database);
        out.put("dbType", connection.getDbType());
        out.put("explainSql", explainSql);
        out.put("columns", result.columns());
        out.put("rows", result.rows());
        return out;
    }

    public Map<String, Object> validateSql(Map<String, Object> args) {
        requireMcpSqlSession();
        String connectionId = stringArg(args, "connectionId");
        String database = optionalString(args, "database");
        String rawSql = stringArg(args, "sql");
        Map<String, Object> out = new LinkedHashMap<>();
        try {
            String safeSql = AiSqlSafetyChecker.requireReadOnlySelect(rawSql);
            out.put("readOnlyOk", true);
            out.put("sql", safeSql);
            AiSqlSchemaContext schema = aiSchemaContextService.build(connectionId, database, safeSql, null);
            AiSqlSemanticChecker.SemanticCheckResult semantic = AiSqlSemanticChecker.check(safeSql, schema);
            out.put("semanticOk", semantic.ok());
            out.put("semanticMessage", semantic.message());
            out.put("columnIssue", semantic.columnIssue());
            out.put("ok", semantic.ok());
        } catch (IllegalArgumentException ex) {
            out.put("readOnlyOk", false);
            out.put("semanticOk", false);
            out.put("ok", false);
            out.put("message", ex.getMessage());
        }
        return out;
    }

    public Object listRelations(Map<String, Object> args) {
        requireMcpCatalogAccess();
        String connectionId = stringArg(args, "connectionId");
        String database = stringArg(args, "database");
        List<String> tableNames = stringListArg(args.get("tableNames"));
        if (tableNames == null || tableNames.isEmpty()) {
            tableNames = listTables(connectionId, database);
            if (tableNames.size() > 6) {
                tableNames = tableNames.subList(0, 6);
            }
        }
        return aiTableRelationService.loadRelations(connectionId, database, tableNames);
    }

    public Map<String, Object> queryStatus(Map<String, Object> args) {
        requireMcpSqlSession();
        String key = resolveExecutionLookupKey(args);
        SqlExecutionTracker.RunningExecution running = connectorFacade.jdbc().session().peekRunning(key);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("key", key);
        out.put("running", running != null);
        if (running != null) {
            out.put("queryId", running.queryId());
            out.put("executionKey", running.executionKey());
        }
        return out;
    }

    public Map<String, Object> cancelQuery(Map<String, Object> args) {
        requireMcpSqlSession();
        featurePermissionAccess.requirePermission(UserFeaturePermission.WORKBENCH_CONSOLE_RUN);
        String key = resolveExecutionLookupKey(args);
        String mode = optionalString(args, "mode");
        SqlExecutionTracker.CancelOutcome outcome = "connection".equalsIgnoreCase(mode == null ? "" : mode)
                ? connectorFacade.jdbc().session().cancelConnection(key)
                : connectorFacade.jdbc().session().cancelQuery(key);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("cancelled", outcome.cancelled());
        out.put("message", outcome.message());
        out.put("queryId", outcome.queryId());
        out.put("key", key);
        return out;
    }

    private String resolveExecutionLookupKey(Map<String, Object> args) {
        String queryId = optionalString(args, "queryId");
        if (queryId != null) {
            return queryId;
        }
        String sessionKey = optionalString(args, "sessionKey");
        if (sessionKey == null) {
            throw new IllegalArgumentException("queryId or sessionKey is required");
        }
        return UserContext.requireUserId() + ":" + sessionKey.trim();
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

    private static Map<String, Object> schemaContextToMap(AiSqlSchemaContext context) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("connectionLabel", context.connectionLabel());
        out.put("database", context.database());
        out.put("dbType", context.dbType());
        out.put("tables", context.tables());
        List<Map<String, String>> ddls = new ArrayList<>();
        for (AiTableDdlSnippet snippet : context.tableDdls()) {
            Map<String, String> row = new LinkedHashMap<>();
            row.put("table", snippet.table());
            row.put("ddl", snippet.ddl());
            ddls.add(row);
        }
        out.put("tableDdls", ddls);
        out.put("tableRelations", context.tableRelations());
        out.put("semanticMetrics", context.semanticMetrics());
        return out;
    }

    @SuppressWarnings("unchecked")
    private static List<String> stringListArg(Object raw) {
        if (raw == null) {
            return null;
        }
        if (raw instanceof List<?> list) {
            List<String> out = new ArrayList<>();
            for (Object item : list) {
                if (item != null) {
                    String text = String.valueOf(item).trim();
                    if (!text.isEmpty()) {
                        out.add(text);
                    }
                }
            }
            return out;
        }
        if (raw instanceof String text && !text.isBlank()) {
            return List.of(text.trim());
        }
        return null;
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
