package org.apache.datawise.backend.backup;

import java.util.List;

/**
 * Identity / metadata tables included in workbench JDBC metadata export.
 * Skips {@code dw_metadata_import} and {@code dw_tc_*}.
 */
final class JdbcMetadataBackupTables {

    static final String METADATA_DIR = "metadata";

    /** Always exported when durable JDBC metadata is enabled. */
    static final List<String> CORE_TABLES = List.of(
            "dw_users",
            "dw_sessions",
            "dw_api_tokens",
            "dw_tenants",
            "dw_tenant_roles",
            "dw_tenant_memberships",
            "dw_team_snapshots",
            "dw_connection_snapshots",
            "dw_oidc_configs",
            "dw_outbound_webhook_snapshots",
            "dw_tenant_ai_usage",
            "dw_project_index",
            "dw_projects",
            "dw_user_active_projects"
    );

    static final String SQL_HISTORY = "dw_sql_history";

    /** Reverse-safe clear order (children before parents). */
    static final List<String> CLEAR_ORDER = List.of(
            SQL_HISTORY,
            "dw_user_active_projects",
            "dw_projects",
            "dw_project_index",
            "dw_tenant_ai_usage",
            "dw_outbound_webhook_snapshots",
            "dw_oidc_configs",
            "dw_connection_snapshots",
            "dw_team_snapshots",
            "dw_api_tokens",
            "dw_sessions",
            "dw_tenant_memberships",
            "dw_tenant_roles",
            "dw_tenants",
            "dw_users"
    );

    private JdbcMetadataBackupTables() {
    }

    static String relativePath(String table) {
        return METADATA_DIR + "/" + table + ".json";
    }
}
