package org.apache.datawise.backend.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.datawise.backend.config.AuthSessionProperties;
import org.apache.datawise.backend.config.TenancyProperties;
import org.apache.datawise.backend.configstore.AuthSessionPolicyService;
import org.apache.datawise.backend.configstore.ConfigDirectoryService;
import org.apache.datawise.backend.configstore.ConnectionStore;
import org.apache.datawise.backend.configstore.FileConnectionStore;
import org.apache.datawise.backend.configstore.OidcConfigStore;
import org.apache.datawise.backend.configstore.FileOidcConfigStore;
import org.apache.datawise.backend.configstore.SessionStore;
import org.apache.datawise.backend.configstore.FileSessionStore;
import org.apache.datawise.backend.configstore.TeamStore;
import org.apache.datawise.backend.configstore.FileTeamStore;
import org.apache.datawise.backend.configstore.TenantStore;
import org.apache.datawise.backend.configstore.FileTenantStore;
import org.apache.datawise.backend.configstore.UserStore;
import org.apache.datawise.backend.configstore.FileUserStore;
import org.apache.datawise.backend.domain.RegisterRequest;
import org.apache.datawise.backend.domain.TenantIds;
import org.apache.datawise.backend.security.SecretTestSupport;
import org.apache.datawise.backend.security.UserContext;
import org.apache.datawise.backend.service.tenant.PlatformAdminPolicy;
import org.apache.datawise.backend.service.tenant.TenantBootstrapService;
import org.apache.datawise.backend.service.tenant.TenantService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

import java.nio.file.Path;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;

class AuthRegisterServiceTest {

    @TempDir
    Path tempDir;

    private AuthService authService;
    private TenantStore tenantStore;
    private TenancyProperties tenancyProperties;

    @BeforeEach
    void setUp() {
        ConfigDirectoryService configDirectory = new ConfigDirectoryService(tempDir);
        ObjectMapper mapper = new ObjectMapper().findAndRegisterModules();
        UserStore userStore = new FileUserStore(configDirectory, mapper);
        tenantStore = new FileTenantStore(configDirectory, mapper);
        TeamStore teamStore = new FileTeamStore(configDirectory, mapper);
        ConnectionStore connectionStore = new FileConnectionStore(
                configDirectory, mapper, SecretTestSupport.testCodec());
        tenancyProperties = new TenancyProperties();
        tenancyProperties.setMode("multi");
        tenancyProperties.setAllowRegistration(true);
        tenancyProperties.setAllowTenantCreate(true);

        OidcConfigStore oidcConfigStore = new FileOidcConfigStore(configDirectory, mapper);
        TenantBootstrapService bootstrap = new TenantBootstrapService(
                tenantStore, userStore, teamStore, connectionStore, oidcConfigStore, tenancyProperties);
        bootstrap.bootstrap();

        AuthSessionPolicyService sessionPolicy = new AuthSessionPolicyService(
                configDirectory, mapper, new AuthSessionProperties());
        SessionStore sessionStore = new FileSessionStore(configDirectory, mapper, sessionPolicy);
        UserAccessPolicy accessPolicy = new UserAccessPolicy();
        UserAdminPolicy adminPolicy = new UserAdminPolicy(userStore, accessPolicy, tenantStore, tenancyProperties);
        UserPermissionPolicy permissionPolicy = new UserPermissionPolicy(
                adminPolicy, tenantStore, tenancyProperties);
        PlatformAdminPolicy platformAdminPolicy = new PlatformAdminPolicy(
                tenancyProperties, accessPolicy, adminPolicy, userStore);
        TenantService tenantService = new TenantService(
                tenantStore, userStore, tenancyProperties, platformAdminPolicy, accessPolicy, bootstrap, List.of());

        authService = new AuthService(
                userStore,
                sessionStore,
                sessionPolicy,
                oidcConfigStore,
                new BCryptPasswordEncoder(),
                mock(GuestSessionCleanupService.class),
                accessPolicy,
                adminPolicy,
                permissionPolicy,
                tenancyProperties,
                tenantStore,
                tenantService,
                platformAdminPolicy,
                mock(org.apache.datawise.backend.configstore.SchemaCacheStore.class),
                new org.apache.datawise.backend.service.auth.LoginAttemptGuard());
    }

    @AfterEach
    void tearDown() {
        UserContext.clear();
    }

    @Test
    void register_firstUserBecomesTenantAdmin() {
        var result = authService.register(new RegisterRequest(
                "newbie", "secret1", null, null, null, null, false));
        assertEquals("newbie", result.userName());
        assertEquals(TenantIds.DEFAULT, result.tenantId());
        assertTrue(tenantStore.hasRoleKey(result.userId(), TenantIds.DEFAULT, TenantIds.ROLE_TENANT_ADMIN));
    }

    @Test
    void register_subsequentUserJoinsAsDeveloper() {
        authService.register(new RegisterRequest(
                "owner", "secret1", null, null, null, null, false));
        var result = authService.register(new RegisterRequest(
                "newbie", "secret1", null, null, null, null, false));
        assertEquals(TenantIds.DEFAULT, result.tenantId());
        assertTrue(tenantStore.hasRoleKey(result.userId(), TenantIds.DEFAULT, TenantIds.ROLE_DEVELOPER));
    }

    @Test
    void register_canCreateTenant() {
        var result = authService.register(new RegisterRequest(
                "founder", "secret1", null, null, "Acme Org", "acme", true));
        assertEquals("acme", result.tenantId());
        assertTrue(tenantStore.hasRoleKey(result.userId(), "acme", TenantIds.ROLE_TENANT_ADMIN));
    }

    @Test
    void register_rejectsWhenDisabled() {
        tenancyProperties.setAllowRegistration(false);
        assertThrows(IllegalArgumentException.class, () -> authService.register(new RegisterRequest(
                "x", "secret1", null, null, null, null, false)));
    }
}
