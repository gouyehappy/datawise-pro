package org.apache.datawise.backend.security;

import org.apache.datawise.backend.domain.UserFeaturePermission;

import java.util.Set;

/**
 * Maps coarse API Token scopes ({@link ApiTokenScopes}) onto feature permission keys.
 * Empty scopes deny all feature checks (no default allow).
 */
public final class ApiTokenFeatureScopes {

    private static final Set<String> SQL_FEATURES = Set.of(
            UserFeaturePermission.NAV_DATABASE,
            UserFeaturePermission.WORKBENCH_CONSOLE_RUN,
            UserFeaturePermission.WORKBENCH_CONSOLE_EXPLAIN,
            UserFeaturePermission.WORKBENCH_CONSOLE_FORMAT,
            UserFeaturePermission.WORKBENCH_EXPLORER_REFRESH,
            UserFeaturePermission.WORKBENCH_EXPLORER_SEARCH,
            UserFeaturePermission.WORKBENCH_EXPLORER_CONTEXT_OPEN,
            UserFeaturePermission.WORKBENCH_EXPLORER_CONTEXT_CONSOLE,
            UserFeaturePermission.WORKBENCH_EXPLORER_CONTEXT_CONNECTION,
            UserFeaturePermission.WORKBENCH_EXPLORER_CONTEXT_EXPORT,
            UserFeaturePermission.WORKBENCH_EXPLORER_CONTEXT_COPY,
            UserFeaturePermission.WORKBENCH_EXPLORER_CATALOG_MODELS,
            UserFeaturePermission.WORKBENCH_EXPLORER_CATALOG_WORKSPACES,
            UserFeaturePermission.WORKBENCH_EXPLORER_CATALOG_AI
    );

    /**
     * Unlocked by {@link ApiTokenScopes#SQL_WRITE} only. Kept out of {@code SQL_FEATURES}
     * so a read-only token cannot run DDL/DML or destroy Explorer resources.
     */
    private static final Set<String> SQL_WRITE_FEATURES = Set.of(
            UserFeaturePermission.WORKBENCH_CONSOLE_DANGEROUS_SQL,
            UserFeaturePermission.WORKBENCH_EXPLORER_CONTEXT_DANGEROUS
    );

    private static final Set<String> MIGRATION_FEATURES = Set.of(
            UserFeaturePermission.SHORTCUT_MIGRATION,
            UserFeaturePermission.NAV_DATABASE,
            UserFeaturePermission.WORKBENCH_EXPLORER_CONTEXT_CONNECTION,
            UserFeaturePermission.WORKBENCH_EXPLORER_CONTEXT_EXPORT
    );

    private static final Set<String> RUNTIME_FEATURES = Set.of(
            UserFeaturePermission.NAV_CONNECTOR_MARKET,
            UserFeaturePermission.NAV_PLUGIN
    );

    private static final Set<String> TERMINAL_FEATURES = Set.of(
            UserFeaturePermission.UTIL_TERMINAL
    );

    private ApiTokenFeatureScopes() {
    }

    public static boolean allows(Set<String> scopes, String feature) {
        if (feature == null || feature.isBlank()) {
            return false;
        }
        if (scopes == null || scopes.isEmpty()) {
            return false;
        }
        if (scopes.contains(feature)) {
            return true;
        }
        if (scopes.contains(ApiTokenScopes.SQL) && SQL_FEATURES.contains(feature)) {
            return true;
        }
        // sql:write implies read, and adds destructive SQL / Explorer actions.
        if (scopes.contains(ApiTokenScopes.SQL_WRITE)
                && (SQL_FEATURES.contains(feature) || SQL_WRITE_FEATURES.contains(feature))) {
            return true;
        }
        if (scopes.contains(ApiTokenScopes.MIGRATION) && MIGRATION_FEATURES.contains(feature)) {
            return true;
        }
        if (scopes.contains(ApiTokenScopes.RUNTIME) && RUNTIME_FEATURES.contains(feature)) {
            return true;
        }
        return scopes.contains(ApiTokenScopes.TERMINAL) && TERMINAL_FEATURES.contains(feature);
    }
}
