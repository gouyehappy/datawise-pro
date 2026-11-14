package org.apache.datawise.backend.security;

import org.apache.datawise.backend.domain.UserFeaturePermission;
import org.junit.jupiter.api.Test;

import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Locks down the scope → feature matrix. Regression guard for P0-1: a read-only
 * {@code sql} token must never unlock DDL/DML or destructive Explorer actions.
 */
class ApiTokenFeatureScopesTest {

    @Test
    void emptyOrNullScopesDenyEverything() {
        assertFalse(ApiTokenFeatureScopes.allows(null, UserFeaturePermission.WORKBENCH_CONSOLE_RUN));
        assertFalse(ApiTokenFeatureScopes.allows(Set.of(), UserFeaturePermission.WORKBENCH_CONSOLE_RUN));
        assertFalse(ApiTokenFeatureScopes.allows(Set.of(), UserFeaturePermission.UTIL_TERMINAL));
    }

    @Test
    void blankFeatureIsDenied() {
        assertFalse(ApiTokenFeatureScopes.allows(Set.of(ApiTokenScopes.SQL_WRITE), null));
        assertFalse(ApiTokenFeatureScopes.allows(Set.of(ApiTokenScopes.SQL_WRITE), " "));
    }

    @Test
    void sqlScopeIsReadOnly() {
        Set<String> scopes = Set.of(ApiTokenScopes.SQL);

        assertTrue(ApiTokenFeatureScopes.allows(scopes, UserFeaturePermission.WORKBENCH_CONSOLE_RUN));
        assertTrue(ApiTokenFeatureScopes.allows(scopes, UserFeaturePermission.WORKBENCH_CONSOLE_EXPLAIN));
        assertTrue(ApiTokenFeatureScopes.allows(scopes, UserFeaturePermission.WORKBENCH_EXPLORER_CONTEXT_EXPORT));
        assertTrue(ApiTokenFeatureScopes.allows(scopes, UserFeaturePermission.NAV_DATABASE));

        assertFalse(ApiTokenFeatureScopes.allows(scopes, UserFeaturePermission.WORKBENCH_CONSOLE_DANGEROUS_SQL));
        assertFalse(ApiTokenFeatureScopes.allows(scopes, UserFeaturePermission.WORKBENCH_EXPLORER_CONTEXT_DANGEROUS));
        assertFalse(ApiTokenFeatureScopes.allows(scopes, UserFeaturePermission.UTIL_TERMINAL));
        assertFalse(ApiTokenFeatureScopes.allows(scopes, UserFeaturePermission.NAV_PLUGIN));
    }

    @Test
    void sqlWriteScopeImpliesReadAndUnlocksDestructiveActions() {
        Set<String> scopes = Set.of(ApiTokenScopes.SQL_WRITE);

        assertTrue(ApiTokenFeatureScopes.allows(scopes, UserFeaturePermission.WORKBENCH_CONSOLE_RUN));
        assertTrue(ApiTokenFeatureScopes.allows(scopes, UserFeaturePermission.WORKBENCH_EXPLORER_CONTEXT_EXPORT));
        assertTrue(ApiTokenFeatureScopes.allows(scopes, UserFeaturePermission.WORKBENCH_CONSOLE_DANGEROUS_SQL));
        assertTrue(ApiTokenFeatureScopes.allows(scopes, UserFeaturePermission.WORKBENCH_EXPLORER_CONTEXT_DANGEROUS));

        assertFalse(ApiTokenFeatureScopes.allows(scopes, UserFeaturePermission.UTIL_TERMINAL));
        assertFalse(ApiTokenFeatureScopes.allows(scopes, UserFeaturePermission.WORKBENCH_EXPLORER_CONTEXT_EDIT));
    }

    @Test
    void migrationScopeStaysNarrow() {
        Set<String> scopes = Set.of(ApiTokenScopes.MIGRATION);

        assertTrue(ApiTokenFeatureScopes.allows(scopes, UserFeaturePermission.SHORTCUT_MIGRATION));
        assertTrue(ApiTokenFeatureScopes.allows(scopes, UserFeaturePermission.WORKBENCH_EXPLORER_CONTEXT_CONNECTION));
        assertFalse(ApiTokenFeatureScopes.allows(scopes, UserFeaturePermission.WORKBENCH_CONSOLE_DANGEROUS_SQL));
        assertFalse(ApiTokenFeatureScopes.allows(scopes, UserFeaturePermission.WORKBENCH_CONSOLE_RUN));
    }

    @Test
    void runtimeScopeCannotTouchSqlOrTerminal() {
        Set<String> scopes = Set.of(ApiTokenScopes.RUNTIME);

        assertTrue(ApiTokenFeatureScopes.allows(scopes, UserFeaturePermission.NAV_PLUGIN));
        assertTrue(ApiTokenFeatureScopes.allows(scopes, UserFeaturePermission.NAV_CONNECTOR_MARKET));
        assertFalse(ApiTokenFeatureScopes.allows(scopes, UserFeaturePermission.WORKBENCH_CONSOLE_RUN));
        assertFalse(ApiTokenFeatureScopes.allows(scopes, UserFeaturePermission.UTIL_TERMINAL));
    }

    @Test
    void terminalScopeIsIsolated() {
        Set<String> scopes = Set.of(ApiTokenScopes.TERMINAL);

        assertTrue(ApiTokenFeatureScopes.allows(scopes, UserFeaturePermission.UTIL_TERMINAL));
        assertFalse(ApiTokenFeatureScopes.allows(scopes, UserFeaturePermission.WORKBENCH_CONSOLE_RUN));
        assertFalse(ApiTokenFeatureScopes.allows(scopes, UserFeaturePermission.WORKBENCH_CONSOLE_DANGEROUS_SQL));
    }

    @Test
    void exactFeatureKeyMayBeUsedAsScope() {
        assertTrue(ApiTokenFeatureScopes.allows(
                Set.of(UserFeaturePermission.WORKBENCH_CONSOLE_FORMAT),
                UserFeaturePermission.WORKBENCH_CONSOLE_FORMAT));
        assertFalse(ApiTokenFeatureScopes.allows(
                Set.of(UserFeaturePermission.WORKBENCH_CONSOLE_FORMAT),
                UserFeaturePermission.WORKBENCH_CONSOLE_RUN));
    }
}
