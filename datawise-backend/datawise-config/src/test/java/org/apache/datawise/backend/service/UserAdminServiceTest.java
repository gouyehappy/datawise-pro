package org.apache.datawise.backend.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.datawise.backend.config.TenancyProperties;
import org.apache.datawise.backend.configstore.ConfigDirectoryService;
import org.apache.datawise.backend.configstore.ConnectionStore;
import org.apache.datawise.backend.configstore.FileConnectionStore;
import org.apache.datawise.backend.configstore.OidcConfigStore;
import org.apache.datawise.backend.configstore.FileOidcConfigStore;
import org.apache.datawise.backend.configstore.TeamStore;
import org.apache.datawise.backend.configstore.FileTeamStore;
import org.apache.datawise.backend.configstore.TenantStore;
import org.apache.datawise.backend.configstore.FileTenantStore;
import org.apache.datawise.backend.configstore.UserStore;
import org.apache.datawise.backend.configstore.FileUserStore;
import org.apache.datawise.backend.domain.TenantIds;
import org.apache.datawise.backend.domain.UpdateUserRolesRequest;
import org.apache.datawise.backend.domain.UserFeaturePermission;
import org.apache.datawise.backend.domain.UserPermissionSummaryDto;
import org.apache.datawise.backend.model.UserEntity;
import org.apache.datawise.backend.security.SecretTestSupport;
import org.apache.datawise.backend.security.UserContext;
import org.apache.datawise.backend.service.tenant.TenantBootstrapService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Path;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class UserAdminServiceTest {

    @TempDir
    Path tempDir;

    private UserStore userStore;
    private UserAdminService adminService;
    private UserPermissionPolicy permissionPolicy;

    @BeforeEach
    void setUp() {
        ConfigDirectoryService configDirectory = new ConfigDirectoryService(tempDir);
        ObjectMapper objectMapper = new ObjectMapper().findAndRegisterModules();
        userStore = new FileUserStore(configDirectory, objectMapper);
        TenantStore tenantStore = new FileTenantStore(configDirectory, objectMapper);
        TenancyProperties tenancy = new TenancyProperties();
        UserAdminPolicy adminPolicy = new UserAdminPolicy(userStore, new UserAccessPolicy(), tenantStore, tenancy);
        permissionPolicy = new UserPermissionPolicy(adminPolicy, tenantStore, tenancy);
        adminService = new UserAdminService(userStore, adminPolicy, permissionPolicy, tenantStore, tenancy);

        userStore.saveUser(user(1L, "admin", false));
        userStore.saveUser(user(2L, "demo", false));
        new TenantBootstrapService(
                tenantStore,
                userStore,
                new FileTeamStore(configDirectory, objectMapper),
                new FileConnectionStore(configDirectory, objectMapper, SecretTestSupport.testCodec()),
                new FileOidcConfigStore(configDirectory, objectMapper),
                tenancy).bootstrap();

        UserContext.set(1L, false, "session-admin", TenantIds.DEFAULT);
    }

    @AfterEach
    void tearDown() {
        UserContext.clear();
    }

    @Test
    void updateUserRoles_clearsLegacyMapAndAppliesRole() {
        UserEntity demo = userStore.findById(2L).orElseThrow();
        demo.setFeaturePermissions(Map.of(UserFeaturePermission.NAV_DASHBOARD, true));
        userStore.saveUser(demo);

        UserPermissionSummaryDto updated = adminService.updateUserRoles(
                2L,
                new UpdateUserRolesRequest(List.of(TenantIds.ROLE_ID_READONLY)));

        assertEquals(List.of(TenantIds.ROLE_ID_READONLY), updated.roleIds());
        assertEquals(List.of(TenantIds.ROLE_READONLY), updated.roleKeys());
        assertFalse(updated.usesLegacyPermissions());
        assertTrue(updated.featurePermissions().get(UserFeaturePermission.NAV_DATABASE));
        assertFalse(updated.featurePermissions().get(UserFeaturePermission.NAV_DASHBOARD));

        UserEntity reloaded = userStore.findById(2L).orElseThrow();
        assertTrue(reloaded.getFeaturePermissions() == null || reloaded.getFeaturePermissions().isEmpty());
    }

    @Test
    void updateUserRoles_allowsTenantAdminAssignment() {
        UserPermissionSummaryDto updated = adminService.updateUserRoles(
                2L,
                new UpdateUserRolesRequest(List.of(TenantIds.ROLE_ID_TENANT_ADMIN)));
        assertEquals(List.of(TenantIds.ROLE_TENANT_ADMIN), updated.roleKeys());
        assertTrue(updated.admin());
        assertTrue(updated.featurePermissions().get(UserFeaturePermission.SETTINGS_USER_PERMISSIONS));
    }

    @Test
    void updateUserPermissions_clearsRolesForCustomMode() {
        adminService.updateUserRoles(2L, new UpdateUserRolesRequest(List.of(TenantIds.ROLE_ID_READONLY)));
        UserPermissionSummaryDto custom = adminService.updateUserPermissions(
                2L,
                new org.apache.datawise.backend.domain.UpdateUserPermissionsRequest(Map.of(
                        UserFeaturePermission.NAV_DATABASE, true,
                        UserFeaturePermission.NAV_DASHBOARD, true)));
        assertTrue(custom.usesLegacyPermissions());
        assertTrue(custom.roleIds() == null || custom.roleIds().isEmpty());
        assertTrue(custom.featurePermissions().get(UserFeaturePermission.NAV_DASHBOARD));
    }

    @Test
    void listRoles_returnsSystemRoles() {
        assertEquals(4, adminService.listRoles().size());
    }

    @Test
    void createUpdateAndDeleteCustomRole() {
        var created = adminService.createRole(new org.apache.datawise.backend.domain.SaveTenantRoleRequest(
                "custom_ops",
                "Custom Ops",
                Map.of(UserFeaturePermission.NAV_DATABASE, true)));
        assertEquals("custom_ops", created.key());
        assertFalse(created.system());
        assertTrue(Boolean.TRUE.equals(created.permissions().get(UserFeaturePermission.NAV_DATABASE)));

        var updated = adminService.updateRole(created.id(), new org.apache.datawise.backend.domain.SaveTenantRoleRequest(
                "ignored_key",
                "Custom Ops Renamed",
                Map.of(UserFeaturePermission.NAV_SETTINGS, true)));
        assertEquals("Custom Ops Renamed", updated.name());
        assertEquals("custom_ops", updated.key());
        assertTrue(Boolean.TRUE.equals(updated.permissions().get(UserFeaturePermission.NAV_SETTINGS)));

        adminService.deleteRole(created.id());
        assertEquals(4, adminService.listRoles().size());
    }

    @Test
    void deleteRole_rejectsSystemAndInUse() {
        assertThrows(
                IllegalArgumentException.class,
                () -> adminService.deleteRole(TenantIds.ROLE_ID_DEVELOPER));

        adminService.updateUserRoles(2L, new UpdateUserRolesRequest(List.of(TenantIds.ROLE_ID_READONLY)));
        assertThrows(
                IllegalArgumentException.class,
                () -> adminService.deleteRole(TenantIds.ROLE_ID_READONLY));
    }

    private static UserEntity user(long id, String username, boolean guest) {
        UserEntity entity = new UserEntity();
        entity.setId(id);
        entity.setUsername(username);
        entity.setDisplayName(username);
        entity.setGuest(guest);
        if (!guest) {
            entity.setPasswordHash("hash");
        }
        return entity;
    }
}
