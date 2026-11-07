package org.apache.datawise.backend.service;

import org.apache.datawise.backend.config.TenancyProperties;
import org.apache.datawise.backend.configstore.ConfigDirectoryService;
import org.apache.datawise.backend.configstore.TenantStore;
import org.apache.datawise.backend.configstore.FileTenantStore;
import org.apache.datawise.backend.configstore.UserStore;
import org.apache.datawise.backend.configstore.FileUserStore;
import org.apache.datawise.backend.domain.UserFeaturePermission;
import org.apache.datawise.backend.model.UserEntity;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Path;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class UserPermissionPolicyTest {

    @TempDir
    Path tempDir;

    private UserPermissionPolicy policy;
    private UserAdminPolicy adminPolicy;
    private TenantStore tenantStore;

    @BeforeEach
    void setUp() {
        ConfigDirectoryService configDirectory = new ConfigDirectoryService(tempDir);
        ObjectMapper objectMapper = new ObjectMapper().findAndRegisterModules();
        UserStore userStore = new FileUserStore(configDirectory, objectMapper);
        tenantStore = new FileTenantStore(configDirectory, objectMapper);
        TenancyProperties tenancyProperties = new TenancyProperties();
        adminPolicy = new UserAdminPolicy(userStore, new UserAccessPolicy(), tenantStore, tenancyProperties);
        policy = new UserPermissionPolicy(adminPolicy, tenantStore, tenancyProperties);

        userStore.saveUser(user("admin", 1L, false));
        userStore.saveUser(user("demo", 2L, false));
        userStore.saveUser(user("guest", 3L, true));
    }

    @Test
    void adminAlwaysHasFullPermissions() {
        UserEntity admin = user("admin", 1L, false);
        Map<String, Boolean> permissions = policy.resolveEffectivePermissions(admin);
        assertTrue(permissions.get(UserFeaturePermission.NAV_SETTINGS));
        assertTrue(permissions.get(UserFeaturePermission.NAV_AI));
    }

    @Test
    void registeredUserWithoutRoleOrOverrideGetsReadonly() {
        UserEntity demo = user("demo", 2L, false);
        assertTrue(policy.hasPermission(demo, UserFeaturePermission.NAV_DATABASE));
        assertFalse(policy.hasPermission(demo, UserFeaturePermission.NAV_DASHBOARD));
        assertFalse(policy.hasPermission(demo, UserFeaturePermission.SETTINGS_USER_PERMISSIONS));
    }

    @Test
    void guestWithoutOverridesGetsWorkbenchPreset() {
        UserEntity guest = user("guest", 3L, true);
        assertTrue(policy.hasPermission(guest, UserFeaturePermission.NAV_DATABASE));
        assertFalse(policy.hasPermission(guest, UserFeaturePermission.NAV_DASHBOARD));
        assertFalse(policy.hasPermission(guest, UserFeaturePermission.NAV_SETTINGS));
    }

    @Test
    void customMapAppliesOnlyWhenNoRoles() {
        UserEntity demo = user("demo", 2L, false);
        demo.setFeaturePermissions(Map.of(
                UserFeaturePermission.NAV_DATABASE, true,
                UserFeaturePermission.NAV_DASHBOARD, false));
        assertTrue(policy.hasPermission(demo, UserFeaturePermission.NAV_DATABASE));
        assertFalse(policy.hasPermission(demo, UserFeaturePermission.NAV_DASHBOARD));
    }

    @Test
    void rolePermissionsTakePrecedenceOverCustomMap() {
        UserEntity demo = user("demo", 2L, false);
        demo.setFeaturePermissions(Map.of(
                UserFeaturePermission.NAV_DASHBOARD, true,
                UserFeaturePermission.NAV_DATABASE, true));

        org.apache.datawise.backend.model.TenantRoleEntity role = new org.apache.datawise.backend.model.TenantRoleEntity();
        role.setId(org.apache.datawise.backend.domain.TenantIds.ROLE_ID_READONLY);
        role.setTenantId(org.apache.datawise.backend.domain.TenantIds.DEFAULT);
        role.setKey(org.apache.datawise.backend.domain.TenantIds.ROLE_READONLY);
        role.setName("Read Only");
        role.setSystem(true);
        role.setPermissions(org.apache.datawise.backend.domain.TenantRolePresets.readonly());
        tenantStore.saveRole(role);

        org.apache.datawise.backend.model.UserTenantMembership membership =
                new org.apache.datawise.backend.model.UserTenantMembership();
        membership.setUserId(2L);
        membership.setTenantId(org.apache.datawise.backend.domain.TenantIds.DEFAULT);
        membership.setStatus("active");
        membership.setRoleIds(java.util.List.of(org.apache.datawise.backend.domain.TenantIds.ROLE_ID_READONLY));
        tenantStore.saveMembership(membership);

        assertTrue(policy.hasPermission(demo, UserFeaturePermission.NAV_DATABASE));
        assertFalse(policy.hasPermission(demo, UserFeaturePermission.NAV_DASHBOARD));
    }

    @Test
    void sanitizeUpdatePersistsWorkbenchExplorerAdd() {
        Map<String, Boolean> updated = policy.sanitizeUpdate(Map.of(
                UserFeaturePermission.WORKBENCH_EXPLORER_ADD, true));
        assertTrue(updated.get(UserFeaturePermission.WORKBENCH_EXPLORER_ADD));
    }

    @Test
    void guestStoredPermissionsCanGrantExplorerAdd() {
        UserEntity guest = user("guest", 3L, true);
        guest.setFeaturePermissions(Map.of(
                UserFeaturePermission.WORKBENCH_EXPLORER_ADD, true));
        assertTrue(policy.hasPermission(guest, UserFeaturePermission.WORKBENCH_EXPLORER_ADD));
        assertFalse(policy.hasPermission(guest, UserFeaturePermission.NAV_DASHBOARD));
    }

    @Test
    void rolePermissionsApplyWhenNoLegacyFeatureMap() {
        UserEntity demo = user("demo", 2L, false);

        org.apache.datawise.backend.model.TenantRoleEntity role = new org.apache.datawise.backend.model.TenantRoleEntity();
        role.setId(org.apache.datawise.backend.domain.TenantIds.ROLE_ID_READONLY);
        role.setTenantId(org.apache.datawise.backend.domain.TenantIds.DEFAULT);
        role.setKey(org.apache.datawise.backend.domain.TenantIds.ROLE_READONLY);
        role.setName("Read Only");
        role.setSystem(true);
        role.setPermissions(org.apache.datawise.backend.domain.TenantRolePresets.readonly());
        tenantStore.saveRole(role);

        org.apache.datawise.backend.model.UserTenantMembership membership =
                new org.apache.datawise.backend.model.UserTenantMembership();
        membership.setUserId(2L);
        membership.setTenantId(org.apache.datawise.backend.domain.TenantIds.DEFAULT);
        membership.setStatus("active");
        membership.setRoleIds(java.util.List.of(org.apache.datawise.backend.domain.TenantIds.ROLE_ID_READONLY));
        tenantStore.saveMembership(membership);

        assertTrue(policy.hasPermission(demo, UserFeaturePermission.NAV_DATABASE));
        assertFalse(policy.hasPermission(demo, UserFeaturePermission.NAV_DASHBOARD));
        assertFalse(policy.hasPermission(demo, UserFeaturePermission.SETTINGS_USER_PERMISSIONS));
    }

    private static UserEntity user(String username, long id, boolean guest) {
        UserEntity entity = new UserEntity();
        entity.setId(id);
        entity.setUsername(username);
        entity.setDisplayName(username);
        entity.setEmail(username + "@datawise.local");
        entity.setGuest(guest);
        if (!guest) {
            entity.setPasswordHash("test-hash");
        }
        return entity;
    }
}
