package org.apache.datawise.backend.service;

import org.apache.datawise.backend.common.UnauthorizedException;
import org.apache.datawise.backend.config.TenancyProperties;
import org.apache.datawise.backend.configstore.ConfigDirectoryService;
import org.apache.datawise.backend.configstore.TenantStore;
import org.apache.datawise.backend.configstore.FileTenantStore;
import org.apache.datawise.backend.configstore.UserStore;
import org.apache.datawise.backend.configstore.FileUserStore;
import org.apache.datawise.backend.model.UserEntity;
import org.apache.datawise.backend.security.UserContext;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Path;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class UserAdminPolicyTest {

    @TempDir
    Path tempDir;

    private UserStore userStore;
    private UserAdminPolicy policy;

    @BeforeEach
    void setUp() {
        ConfigDirectoryService configDirectory = new ConfigDirectoryService(tempDir);
        ObjectMapper objectMapper = new ObjectMapper().findAndRegisterModules();
        userStore = new FileUserStore(configDirectory, objectMapper);
        TenantStore tenantStore = new FileTenantStore(configDirectory, objectMapper);
        policy = new UserAdminPolicy(userStore, new UserAccessPolicy(), tenantStore, new TenancyProperties());

        UserEntity admin = user("admin", 1L);
        UserEntity demo = user("demo", 2L);
        userStore.saveUser(admin);
        userStore.saveUser(demo);
    }

    @AfterEach
    void tearDown() {
        UserContext.clear();
    }

    @Test
    void bootstrapAdminCanPassRequireAdminUser() {
        UserContext.set(1L, false, "session-admin");

        policy.requireAdminUser();

        assertTrue(policy.isAdminUser(1L));
    }

    @Test
    void nonAdminRegisteredUserIsRejected() {
        UserContext.set(2L, false, "session-demo");

        IllegalArgumentException ex = assertThrows(IllegalArgumentException.class, policy::requireAdminUser);
        assertEquals(UserAdminPolicy.ADMIN_REQUIRED, ex.getMessage());
        assertFalse(policy.isAdminUser(2L));
    }

    @Test
    void apiTokenCannotUpdateSessionPolicy() {
        UserContext.setApiToken(1L, "token-1", java.util.Set.of());

        UnauthorizedException ex = assertThrows(UnauthorizedException.class, policy::requireAdminUser);
        assertEquals(UnauthorizedException.CODE, ex.getMessage());
    }

    private static UserEntity user(String username, long id) {
        UserEntity entity = new UserEntity();
        entity.setId(id);
        entity.setUsername(username);
        entity.setDisplayName(username);
        entity.setEmail(username + "@datawise.local");
        entity.setGuest(false);
        entity.setPasswordHash("test-hash");
        return entity;
    }
}
