package org.apache.datawise.backend.service;

import org.apache.datawise.backend.common.UnauthorizedException;
import org.apache.datawise.backend.config.TenancyProperties;
import org.apache.datawise.backend.configstore.TenantStore;
import org.apache.datawise.backend.configstore.UserStore;
import org.apache.datawise.backend.domain.UserFeaturePermission;
import org.apache.datawise.backend.model.UserEntity;
import org.apache.datawise.backend.security.UserContext;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class FeaturePermissionAccessTest {

    @Mock
    private UserStore userStore;

    @Mock
    private UserAdminPolicy adminPolicy;

    @Mock
    private TenantStore tenantStore;

    private UserPermissionPolicy permissionPolicy;
    private UserResourcePolicy resourcePolicy;
    private FeaturePermissionAccess access;

    @BeforeEach
    void setUp() {
        permissionPolicy = new UserPermissionPolicy(adminPolicy, tenantStore, new TenancyProperties());
        resourcePolicy = new UserResourcePolicy(new UserAccessPolicy());
        access = new FeaturePermissionAccess(userStore, permissionPolicy, resourcePolicy);
        UserContext.set(2L, true, "guest-session");
    }

    @AfterEach
    void tearDown() {
        UserContext.clear();
    }

    @Test
    void requireSqlExecute_allowsSelectForWorkbenchGuest() {
        UserEntity guest = guestUser();
        when(userStore.findById(2L)).thenReturn(Optional.of(guest));

        assertDoesNotThrow(() -> access.requireSqlExecute("SELECT 1"));
    }

    @Test
    void requireSqlExecute_deniesWriteForWorkbenchGuest() {
        UserEntity guest = guestUser();
        when(userStore.findById(2L)).thenReturn(Optional.of(guest));

        assertThrows(
                IllegalArgumentException.class,
                () -> access.requireSqlExecute("DELETE FROM t"));
    }

    @Test
    void requireExplorerCatalogMutation_allowsGuestSessionCatalogWrite() {
        assertDoesNotThrow(() -> access.requireExplorerCatalogMutation());
    }

    @Test
    void requireExplorerContextConnection_allowsGuestSessionCatalogRead() {
        assertDoesNotThrow(() -> access.requireExplorerContextConnection());
    }

    @Test
    void requireExplorerContextDangerous_deniesWorkbenchGuest() {
        UserEntity guest = guestUser();
        when(userStore.findById(2L)).thenReturn(Optional.of(guest));

        assertThrows(
                IllegalArgumentException.class,
                access::requireExplorerContextDangerous);
    }

    @Test
    void requireExplorerNodeDelete_allowsGuestCatalogStructureNode() {
        assertDoesNotThrow(() -> access.requireExplorerNodeDelete(true));
    }

    @Test
    void requireExplorerNodeDelete_deniesGuestNonCatalogStructureNode() {
        UserEntity guest = guestUser();
        when(userStore.findById(2L)).thenReturn(Optional.of(guest));

        assertThrows(
                IllegalArgumentException.class,
                () -> access.requireExplorerNodeDelete(false));
    }

    @Test
    void requirePermission_deniesDangerousForReadOnlySqlScope() {
        UserContext.clear();
        UserContext.setApiToken(2L, "token-1", java.util.Set.of("sql"));

        assertThrows(IllegalArgumentException.class, access::requireExplorerContextDangerous);
    }

    @Test
    void requirePermission_sqlWriteStillNeedsUserDangerousGrant() {
        UserContext.clear();
        UserContext.setApiToken(2L, "token-1", java.util.Set.of("sql:write"));
        // Bound user is workbench guest — no dangerous SQL — intersection must deny.
        when(userStore.findById(2L)).thenReturn(Optional.of(guestUser()));

        assertThrows(IllegalArgumentException.class, access::requireExplorerContextDangerous);
    }

    @Test
    void requirePermission_allowsDangerousWhenScopeAndUserBothGrant() {
        UserContext.clear();
        UserContext.setApiToken(2L, "token-1", java.util.Set.of("sql:write"));
        when(userStore.findById(2L)).thenReturn(Optional.of(fullPermissionUser(2L)));

        assertDoesNotThrow(access::requireExplorerContextDangerous);
    }

    @Test
    void requireSqlExecute_readOnlyTokenCannotRunUpdate() {
        UserContext.clear();
        UserContext.setApiToken(2L, "token-1", java.util.Set.of("sql"));
        when(userStore.findById(2L)).thenReturn(Optional.of(guestUser()));

        assertDoesNotThrow(() -> access.requireSqlExecute("SELECT 1"));
        assertThrows(
                IllegalArgumentException.class,
                () -> access.requireSqlExecute("UPDATE users SET name = 'x'"));
    }

    @Test
    void requireSqlExecute_writeTokenCanRunUpdateWhenUserAllows() {
        UserContext.clear();
        UserContext.setApiToken(2L, "token-1", java.util.Set.of("sql:write"));
        when(userStore.findById(2L)).thenReturn(Optional.of(fullPermissionUser(2L)));

        assertDoesNotThrow(() -> access.requireSqlExecute("UPDATE users SET name = 'x'"));
    }

    @Test
    void requirePermission_deniesApiTokenWithoutMatchingScope() {
        UserContext.clear();
        UserContext.setApiToken(2L, "token-1", java.util.Set.of());

        assertThrows(IllegalArgumentException.class, access::requireExplorerContextDangerous);
    }

    @Test
    void requireUtilTerminal_requiresTerminalScopeForApiToken() {
        UserContext.clear();
        UserContext.setApiToken(2L, "token-1", java.util.Set.of("sql"));
        when(userStore.findById(2L)).thenReturn(Optional.of(fullPermissionUser(2L)));

        assertThrows(IllegalArgumentException.class, access::requireUtilTerminal);

        UserContext.clear();
        UserContext.setApiToken(2L, "token-1", java.util.Set.of("terminal"));
        when(userStore.findById(2L)).thenReturn(Optional.of(fullPermissionUser(2L)));
        assertDoesNotThrow(access::requireUtilTerminal);
    }

    @Test
    void requireCurrentUser_missingUserThrowsUnauthorized() {
        when(userStore.findById(2L)).thenReturn(Optional.empty());

        assertThrows(UnauthorizedException.class, () -> access.requireUtilTerminal());
    }

    @Test
    void requireRedisCommand_delRequiresDangerousPermission() {
        UserEntity guest = guestUser();
        when(userStore.findById(2L)).thenReturn(Optional.of(guest));

        assertThrows(
                IllegalArgumentException.class,
                () -> access.requireRedisCommand("DEL mykey"));
    }

    @Test
    void requireRedisCommand_renameRequiresDangerousPermission() {
        UserEntity guest = guestUser();
        when(userStore.findById(2L)).thenReturn(Optional.of(guest));

        assertThrows(
                IllegalArgumentException.class,
                () -> access.requireRedisCommand("RENAME a b"));
    }

    @Test
    void requireExplorerCatalogFolder_allowsSchemaFoldersForWorkbenchGuest() {
        UserEntity guest = guestUser();
        when(userStore.findById(2L)).thenReturn(Optional.of(guest));

        assertDoesNotThrow(() -> access.requireExplorerCatalogFolder("tables"));
        assertDoesNotThrow(() -> access.requireExplorerCatalogFolder("views"));
    }

    @Test
    void requireExplorerCatalogFolder_deniesModelsForWorkbenchGuest() {
        UserEntity guest = guestUser();
        when(userStore.findById(2L)).thenReturn(Optional.of(guest));

        assertThrows(
                IllegalArgumentException.class,
                () -> access.requireExplorerCatalogFolder("models"));
    }

    @Test
    void filterCatalogFolderChildren_hidesOptionalFoldersForWorkbenchGuest() {
        UserEntity guest = guestUser();
        when(userStore.findById(2L)).thenReturn(Optional.of(guest));

        org.apache.datawise.backend.domain.TreeNode tables = folder("tables");
        org.apache.datawise.backend.domain.TreeNode models = folder("models");
        org.apache.datawise.backend.domain.TreeNode ai = folder("ai");

        var filtered = access.filterCatalogFolderChildren(java.util.List.of(tables, models, ai));
        assertEquals(1, filtered.size());
        assertEquals("tables", filtered.get(0).getLabel());
    }

    private static org.apache.datawise.backend.domain.TreeNode folder(String label) {
        org.apache.datawise.backend.domain.TreeNode node = new org.apache.datawise.backend.domain.TreeNode();
        node.setType("folder");
        node.setLabel(label);
        return node;
    }

    private static UserEntity guestUser() {
        UserEntity guest = new UserEntity();
        guest.setId(2L);
        guest.setGuest(true);
        guest.setFeaturePermissions(UserFeaturePermission.workbenchPreset());
        return guest;
    }

    private static UserEntity fullPermissionUser(long id) {
        UserEntity user = new UserEntity();
        user.setId(id);
        user.setGuest(false);
        user.setFeaturePermissions(UserFeaturePermission.fullPreset());
        return user;
    }
}
