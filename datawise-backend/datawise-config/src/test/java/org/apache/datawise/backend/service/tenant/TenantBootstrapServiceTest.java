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
import org.apache.datawise.backend.domain.TenantIds;
import org.apache.datawise.backend.model.UserEntity;
import org.apache.datawise.backend.security.SecretTestSupport;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class TenantBootstrapServiceTest {

    @TempDir
    Path tempDir;

    private TenantStore tenantStore;
    private UserStore userStore;
    private TenantBootstrapService bootstrap;

    @BeforeEach
    void setUp() {
        ConfigDirectoryService configDirectory = new ConfigDirectoryService(tempDir);
        ObjectMapper objectMapper = new ObjectMapper().findAndRegisterModules();
        tenantStore = new FileTenantStore(configDirectory, objectMapper);
        userStore = new FileUserStore(configDirectory, objectMapper);
        TeamStore teamStore = new FileTeamStore(configDirectory, objectMapper);
        ConnectionStore connectionStore = new FileConnectionStore(
                configDirectory, objectMapper, SecretTestSupport.testCodec());
        OidcConfigStore oidcConfigStore = new FileOidcConfigStore(configDirectory, objectMapper);
        bootstrap = new TenantBootstrapService(
                tenantStore, userStore, teamStore, connectionStore, oidcConfigStore, new TenancyProperties());

        userStore.saveUser(user(1L, "admin", false));
        userStore.saveUser(user(2L, "demo", false));
        userStore.saveUser(user(3L, "guest", true));
    }

    @Test
    void bootstrap_createsDefaultTenantRolesAndMemberships() {
        bootstrap.bootstrap();

        assertTrue(tenantStore.findTenantById(TenantIds.DEFAULT).isPresent());
        assertEquals(4, tenantStore.listRoles(TenantIds.DEFAULT).size());
        assertTrue(tenantStore.hasRoleKey(1L, TenantIds.DEFAULT, TenantIds.ROLE_TENANT_ADMIN));
        assertTrue(tenantStore.hasRoleKey(2L, TenantIds.DEFAULT, TenantIds.ROLE_DEVELOPER));
        assertTrue(tenantStore.findMembership(3L, TenantIds.DEFAULT).isEmpty());
    }

    @Test
    void bootstrap_isIdempotent() {
        bootstrap.bootstrap();
        bootstrap.bootstrap();

        assertEquals(1, tenantStore.listTenants().size());
        assertEquals(4, tenantStore.listRoles(TenantIds.DEFAULT).size());
        assertEquals(2, tenantStore.listMemberships(TenantIds.DEFAULT).size());
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
