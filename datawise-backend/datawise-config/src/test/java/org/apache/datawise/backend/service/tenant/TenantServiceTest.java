package org.apache.datawise.backend.service.tenant;

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
import org.apache.datawise.backend.domain.CreateTenantRequest;
import org.apache.datawise.backend.domain.TenantIds;
import org.apache.datawise.backend.domain.UpdateTenantStatusRequest;
import org.apache.datawise.backend.domain.tenant.TenantLifecycleListener;
import org.apache.datawise.backend.model.UserEntity;
import org.apache.datawise.backend.security.SecretTestSupport;
import org.apache.datawise.backend.security.UserContext;
import org.apache.datawise.backend.service.UserAccessPolicy;
import org.apache.datawise.backend.service.UserAdminPolicy;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Path;
import java.util.List;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class TenantServiceTest {

    @TempDir
    Path tempDir;

    private TenantStore tenantStore;
    private TenantService tenantService;
    private TenancyProperties tenancyProperties;

    @BeforeEach
    void setUp() {
        ConfigDirectoryService configDirectory = new ConfigDirectoryService(tempDir);
        ObjectMapper objectMapper = new ObjectMapper().findAndRegisterModules();
        tenantStore = new FileTenantStore(configDirectory, objectMapper);
        UserStore userStore = new FileUserStore(configDirectory, objectMapper);
        TeamStore teamStore = new FileTeamStore(configDirectory, objectMapper);
        ConnectionStore connectionStore = new FileConnectionStore(
                configDirectory, objectMapper, SecretTestSupport.testCodec());
        tenancyProperties = new TenancyProperties();
        tenancyProperties.setMode("multi");
        tenancyProperties.setAllowTenantCreate(false);
        tenancyProperties.setPlatformAdminUserIds(java.util.List.of(1L));

        TenantBootstrapService bootstrap = new TenantBootstrapService(
                tenantStore, userStore, teamStore, connectionStore,
                new FileOidcConfigStore(configDirectory, objectMapper), tenancyProperties);
        UserAccessPolicy accessPolicy = new UserAccessPolicy();
        UserAdminPolicy adminPolicy = new UserAdminPolicy(userStore, accessPolicy, tenantStore, tenancyProperties);
        PlatformAdminPolicy platformAdminPolicy = new PlatformAdminPolicy(
                tenancyProperties, accessPolicy, adminPolicy, userStore);
        tenantService = new TenantService(
                tenantStore, userStore, tenancyProperties, platformAdminPolicy, accessPolicy, bootstrap, List.of());

        userStore.saveUser(user(1L, "admin", false));
        userStore.saveUser(user(2L, "demo", false));
        bootstrap.bootstrap();
    }

    @AfterEach
    void tearDown() {
        UserContext.clear();
    }

    @Test
    void createTenant_asPlatformAdmin() {
        UserContext.set(1L, false, "session-1", TenantIds.DEFAULT);
        var created = tenantService.createTenant(new CreateTenantRequest("Acme Corp", "acme", null));
        assertEquals("acme", created.id());
        assertTrue(tenantStore.hasRoleKey(1L, "acme", TenantIds.ROLE_TENANT_ADMIN));
        assertEquals(4, tenantStore.listRoles("acme").size());
    }

    @Test
    void createTenant_invokesLifecycleListener() {
        AtomicReference<String> notified = new AtomicReference<>();
        TenantService service = rebuildServiceWithListener(notified::set);

        UserContext.set(1L, false, "session-1", TenantIds.DEFAULT);
        service.createTenant(new CreateTenantRequest("Delta", "delta", null));
        assertEquals("delta", notified.get());
    }

    private TenantService rebuildServiceWithListener(TenantLifecycleListener listener) {
        ConfigDirectoryService configDirectory = new ConfigDirectoryService(tempDir);
        ObjectMapper objectMapper = new ObjectMapper().findAndRegisterModules();
        UserStore userStore = new FileUserStore(configDirectory, objectMapper);
        TeamStore teamStore = new FileTeamStore(configDirectory, objectMapper);
        ConnectionStore connectionStore = new FileConnectionStore(
                configDirectory, objectMapper, SecretTestSupport.testCodec());
        TenantBootstrapService bootstrap = new TenantBootstrapService(
                tenantStore,
                userStore,
                teamStore,
                connectionStore,
                new FileOidcConfigStore(configDirectory, objectMapper),
                tenancyProperties);
        UserAccessPolicy accessPolicy = new UserAccessPolicy();
        UserAdminPolicy adminPolicy = new UserAdminPolicy(userStore, accessPolicy, tenantStore, tenancyProperties);
        PlatformAdminPolicy platformAdminPolicy = new PlatformAdminPolicy(
                tenancyProperties, accessPolicy, adminPolicy, userStore);
        return new TenantService(
                tenantStore,
                userStore,
                tenancyProperties,
                platformAdminPolicy,
                accessPolicy,
                bootstrap,
                List.of(listener));
    }

    @Test
    void createTenant_rejectsWhenSingleMode() {
        tenancyProperties.setMode("single");
        UserContext.set(1L, false, "session-1", TenantIds.DEFAULT);
        assertThrows(
                IllegalArgumentException.class,
                () -> tenantService.createTenant(new CreateTenantRequest("X", "xorg", null)));
    }

    @Test
    void updateStatus_suspendsTenant() {
        UserContext.set(1L, false, "session-1", TenantIds.DEFAULT);
        tenantService.createTenant(new CreateTenantRequest("Beta", "beta", null));
        var updated = tenantService.updateStatus("beta", new UpdateTenantStatusRequest("suspended"));
        assertEquals("suspended", updated.status());
        assertThrows(IllegalArgumentException.class, () -> tenantService.requireActiveTenant("beta"));
    }

    @Test
    void inviteAndListAndRemoveMembers() {
        UserContext.set(1L, false, "session-1", TenantIds.DEFAULT);
        tenantService.createTenant(new CreateTenantRequest("Gamma", "gamma", null));

        tenantService.inviteMember(
                "gamma",
                new org.apache.datawise.backend.domain.InviteTenantMemberRequest(
                        2L, null, java.util.List.of(TenantIds.ROLE_DEVELOPER)));
        var members = tenantService.listMembers("gamma");
        assertEquals(2, members.size());
        assertTrue(members.stream().anyMatch(m -> m.userId() == 2L && m.roleKeys().contains(TenantIds.ROLE_DEVELOPER)));

        tenantService.removeMember("gamma", 2L);
        assertEquals(1, tenantService.listMembers("gamma").size());
        assertThrows(IllegalArgumentException.class, () -> tenantService.removeMember("gamma", 1L));
    }

    private static UserEntity user(long id, String username, boolean guest) {
        UserEntity entity = new UserEntity();
        entity.setId(id);
        entity.setUsername(username);
        entity.setGuest(guest);
        if (!guest) {
            entity.setPasswordHash("hash");
        }
        return entity;
    }
}
