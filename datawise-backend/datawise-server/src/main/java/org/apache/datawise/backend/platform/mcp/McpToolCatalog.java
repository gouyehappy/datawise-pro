package org.apache.datawise.backend.platform.mcp;

import org.apache.datawise.backend.domain.UserFeaturePermission;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Canonical MCP tool registry. New tools: add a {@link McpToolSpec} here and a case in
 * {@link McpBridgeService#invoke} — do not add new REST mappings for MCP-only tools.
 */
public final class McpToolCatalog {

    private static final List<McpToolSpec> SPECS = List.of(
            spec("get_workbench_context",
                    "Read the user's live DataWise UI focus (connection, open tabs, editor preview)",
                    true, false, null, McpToolSpec.RISK_READ,
                    "includeBodyPreview"),
            spec("list_connections", "List visible database connections",
                    true, false, null, McpToolSpec.RISK_READ),
            spec("list_tables", "List tables for a connection/database",
                    true, false, UserFeaturePermission.NAV_DATABASE, McpToolSpec.RISK_READ,
                    "connectionId", "database"),
            spec("describe_table", "Load DDL / column definition for a single table",
                    true, false, UserFeaturePermission.NAV_DATABASE, McpToolSpec.RISK_READ,
                    "connectionId", "database", "tableName"),
            spec("get_schema_context",
                    "Build compressed schema context (tables, DDL snippets, relations, metrics) for AI prompts",
                    true, false, UserFeaturePermission.NAV_DATABASE, McpToolSpec.RISK_READ,
                    "connectionId", "database", "prompt", "tableNames"),
            spec("get_sample_data",
                    "Fetch a small sample of table rows so models see real enum/date/encoding values",
                    true, false, UserFeaturePermission.NAV_DATABASE, McpToolSpec.RISK_READ,
                    "connectionId", "database", "tableName", "maxRows"),
            spec("explain_query",
                    "Run dialect EXPLAIN / query plan for a SQL statement (read-only)",
                    true, false, UserFeaturePermission.WORKBENCH_CONSOLE_EXPLAIN, McpToolSpec.RISK_READ,
                    "connectionId", "database", "sql"),
            spec("review_sql", "Review SQL before execution",
                    true, false, null, McpToolSpec.RISK_READ,
                    "sql", "connectionId", "database"),
            spec("validate_sql",
                    "Validate SQL is read-only and optionally check table/column names against schema",
                    true, false, null, McpToolSpec.RISK_READ,
                    "sql", "connectionId", "database"),
            spec("list_relations", "List foreign-key relations among tables",
                    true, false, UserFeaturePermission.NAV_DATABASE, McpToolSpec.RISK_READ,
                    "connectionId", "database", "tableNames"),
            spec("query_status", "Check whether a console queryId/sessionKey is still running",
                    true, false, null, McpToolSpec.RISK_READ,
                    "queryId", "sessionKey"),
            spec("cancel_query", "Cancel a running console query by queryId or sessionKey",
                    false, true, null, McpToolSpec.RISK_SESSION,
                    "queryId", "sessionKey", "mode"),
            spec("execute_readonly_sql", "Execute read-only SELECT SQL",
                    true, false, null, McpToolSpec.RISK_READ,
                    "sql", "connectionId", "database", "maxRows"),
            spec("compare_schema", "Compare schema drift between environments",
                    true, false, null, McpToolSpec.RISK_READ,
                    "sourceConnectionId", "sourceDatabase", "targetConnectionId", "targetDatabase"),
            spec("list_semantic_metrics", "List semantic layer metrics for a database",
                    true, false, null, McpToolSpec.RISK_READ,
                    "connectionId", "database"),
            spec("rerun_canvas", "Rerun an analysis canvas with parameter values",
                    false, true, null, McpToolSpec.RISK_SESSION,
                    "canvasId", "parameterValues"),
            spec("generate_federated_sql", "Generate cross-source federated SQL from natural language",
                    true, false, null, McpToolSpec.RISK_READ,
                    "prompt", "sources"),
            spec("propose_open_console",
                    "Propose opening a SQL console tab with optional SQL (requires DataWise UI confirm)",
                    false, true, UserFeaturePermission.WORKBENCH_TAB_NEW, McpToolSpec.RISK_SESSION,
                    "connectionId", "database", "sql", "title"),
            spec("get_access_policy",
                    "Read the current tenant MCP access policy (readOnly / allowDangerousSql / allowlist)",
                    true, false, UserFeaturePermission.SETTINGS_AI, McpToolSpec.RISK_READ),
            spec("set_access_policy",
                    "Update the tenant MCP access policy (dangerous — affects all MCP clients)",
                    false, true, UserFeaturePermission.SETTINGS_AI, McpToolSpec.RISK_WRITE,
                    "readOnly", "allowDangerousSql", "allowedToolNames"),
            spec("get_call_history",
                    "List recent MCP invoke audit entries for the current process",
                    true, false, UserFeaturePermission.SETTINGS_AI, McpToolSpec.RISK_READ,
                    "limit")
    );

    private static final Map<String, McpToolSpec> BY_NAME;

    static {
        Map<String, McpToolSpec> map = new LinkedHashMap<>();
        for (McpToolSpec spec : SPECS) {
            map.put(spec.name(), spec);
        }
        BY_NAME = Map.copyOf(map);
    }

    private McpToolCatalog() {
    }

    public static List<McpToolSpec> all() {
        return SPECS;
    }

    public static Optional<McpToolSpec> find(String name) {
        if (name == null || name.isBlank()) {
            return Optional.empty();
        }
        return Optional.ofNullable(BY_NAME.get(name.trim()));
    }

    public static McpToolSpec require(String name) {
        return find(name).orElseThrow(() -> new IllegalArgumentException("unknown tool: " + name));
    }

    private static McpToolSpec spec(
            String name,
            String description,
            boolean readOnly,
            boolean dangerous,
            String requiredFeature,
            String riskLevel,
            String... args
    ) {
        return new McpToolSpec(
                name,
                description,
                List.of(args),
                readOnly,
                dangerous,
                requiredFeature,
                riskLevel
        );
    }
}
