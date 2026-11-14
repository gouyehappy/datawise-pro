/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements.  See the NOTICE file distributed with
 * this work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache License, Version 2.0
 * (the "License"); you may not use this file except in compliance with
 * the License.  You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
package org.apache.datawise.backend.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import org.apache.datawise.backend.common.UnauthorizedException;
import org.apache.datawise.backend.config.TenancyProperties;
import org.apache.datawise.backend.configstore.ConfigDirectoryService;
import org.apache.datawise.backend.configstore.FileTenantStore;
import org.apache.datawise.backend.configstore.FileUserStore;
import org.apache.datawise.backend.configstore.TenantStore;
import org.apache.datawise.backend.domain.UserFeaturePermission;
import org.apache.datawise.backend.model.UserEntity;
import org.apache.datawise.backend.service.FeaturePermissionAccess;
import org.apache.datawise.backend.service.UserAccessPolicy;
import org.apache.datawise.backend.service.UserAdminPolicy;
import org.apache.datawise.backend.service.UserPermissionPolicy;
import org.apache.datawise.backend.service.UserResourcePolicy;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.aop.aspectj.annotation.AspectJProxyFactory;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.atomic.AtomicBoolean;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Integration test for the request-authorization chain.
 *
 * <p>Unlike {@code FeaturePermissionAccessTest} (Mockito collaborators), every participant here
 * is the real object: users and tenants are persisted to a temporary config directory through
 * {@link FileUserStore} / {@link FileTenantStore}, permissions are resolved by the real
 * {@link UserPermissionPolicy}, and {@link RequiresFeatureAspect} is woven with AspectJ so the
 * annotation path is exercised end to end.
 *
 * <p>The invariant under test: an API token is authorized by {@code scope ∩ bound-user RBAC},
 * a read-only {@code sql} scope can never reach DDL/DML, {@code sql:write} cannot elevate a
 * readonly user, and a token identity can never escalate itself to admin.
 */
class ApiTokenFeatureGateIT {

    private static final long ADMIN_ID = 1L;
    private static final long ANALYST_ID = 7L;
    private static final String TOKEN_ID = "tok-it";

    @TempDir
    Path configRoot;

    private FileUserStore userStore;
    private FeaturePermissionAccess access;
    private UserAdminPolicy adminPolicy;
    private GuardedEndpoints endpoints;

    @BeforeEach
    void setUp() throws IOException {
        Files.createDirectories(configRoot);
        ConfigDirectoryService configDirectory = new ConfigDirectoryService(configRoot);
        ObjectMapper objectMapper = new ObjectMapper().registerModule(new JavaTimeModule());

        userStore = new FileUserStore(configDirectory, objectMapper);
        TenantStore tenantStore = new FileTenantStore(configDirectory, objectMapper);
        userStore.saveUser(registeredUser(ADMIN_ID, "admin"));
        // ANALYST_ID is deliberately not the lowest id, so bootstrap-admin must not claim it.
        userStore.saveUser(registeredUser(ANALYST_ID, "analyst"));

        UserAccessPolicy accessPolicy = new UserAccessPolicy();
        TenancyProperties tenancyProperties = new TenancyProperties();
        adminPolicy = new UserAdminPolicy(userStore, accessPolicy, tenantStore, tenancyProperties);
        UserPermissionPolicy permissionPolicy =
                new UserPermissionPolicy(adminPolicy, tenantStore, tenancyProperties);
        UserResourcePolicy resourcePolicy = new UserResourcePolicy(accessPolicy);
        access = new FeaturePermissionAccess(userStore, permissionPolicy, resourcePolicy);

        GuardedEndpointsImpl target = new GuardedEndpointsImpl();
        AspectJProxyFactory factory = new AspectJProxyFactory(target);
        factory.setProxyTargetClass(true);
        factory.addAspect(new RequiresFeatureAspect(access));
        endpoints = factory.getProxy();
    }

    @AfterEach
    void tearDown() {
        UserContext.clear();
    }

    @Test
    void readSqlScopeCanQueryButCannotRunDml() {
        UserContext.setApiToken(ANALYST_ID, TOKEN_ID, Set.of(ApiTokenScopes.SQL));

        assertDoesNotThrow(() -> access.requireSqlExecute("SELECT * FROM orders"));
        assertDoesNotThrow(() -> access.requireSqlExecute("WITH x AS (SELECT 1) SELECT * FROM x"));

        assertEquals(
                "API token missing required scope for this feature",
                assertThrows(
                        IllegalArgumentException.class,
                        () -> access.requireSqlExecute("DELETE FROM orders"))
                        .getMessage());
        assertThrows(IllegalArgumentException.class, () -> access.requireSqlExecute("DROP TABLE orders"));
        assertThrows(IllegalArgumentException.class, () -> access.requireExplorerContextDangerous());
    }

    @Test
    void sqlWriteScopeAloneCannotElevateReadonlyUser() {
        UserContext.setApiToken(ANALYST_ID, TOKEN_ID, Set.of(ApiTokenScopes.SQL_WRITE));

        // Analyst has readonly RBAC — intersection must block DDL/DML even with sql:write.
        assertDoesNotThrow(() -> access.requireSqlExecute("SELECT 1"));
        assertEquals(
                "PERMISSION_DENIED",
                assertThrows(
                        IllegalArgumentException.class,
                        () -> access.requireSqlExecute("UPDATE orders SET status = 'done'"))
                        .getMessage());
        assertThrows(IllegalArgumentException.class, () -> access.requireExplorerContextDangerous());
    }

    @Test
    void sqlWriteScopeUnlocksDestructiveWhenUserAlsoGrants() {
        UserEntity analyst = userStore.findById(ANALYST_ID).orElseThrow();
        analyst.setFeaturePermissions(Map.of(
                UserFeaturePermission.WORKBENCH_CONSOLE_RUN, true,
                UserFeaturePermission.WORKBENCH_CONSOLE_DANGEROUS_SQL, true,
                UserFeaturePermission.WORKBENCH_EXPLORER_CONTEXT_DANGEROUS, true));
        userStore.saveUser(analyst);

        UserContext.setApiToken(ANALYST_ID, TOKEN_ID, Set.of(ApiTokenScopes.SQL_WRITE));

        assertDoesNotThrow(() -> access.requireSqlExecute("SELECT 1"));
        assertDoesNotThrow(() -> access.requireSqlExecute("UPDATE orders SET status = 'done'"));
        assertDoesNotThrow(() -> access.requireSqlExecute("TRUNCATE TABLE orders"));
        assertDoesNotThrow(() -> access.requireExplorerContextDangerous());
    }

    @Test
    void annotationGateRejectsBeforeMethodBodyRuns() {
        GuardedEndpointsImpl target = new GuardedEndpointsImpl();
        AspectJProxyFactory factory = new AspectJProxyFactory(target);
        factory.setProxyTargetClass(true);
        factory.addAspect(new RequiresFeatureAspect(access));
        GuardedEndpoints proxy = factory.getProxy();

        UserContext.setApiToken(ANALYST_ID, TOKEN_ID, Set.of(ApiTokenScopes.TERMINAL));

        IllegalArgumentException error =
                assertThrows(IllegalArgumentException.class, () -> proxy.runConsole("SELECT 1"));
        assertEquals("API token missing required scope for this feature", error.getMessage());
        assertFalse(target.consoleInvoked.get(), "aspect must block before the endpoint body executes");
    }

    @Test
    void annotationGateAllowsMatchingScope() {
        UserContext.setApiToken(ANALYST_ID, TOKEN_ID, Set.of(ApiTokenScopes.SQL));

        String result = endpoints.runConsole("SELECT 1");
        assertEquals("ran:SELECT 1", result);
    }

    @Test
    void tokenWithoutScopesIsDeniedEverywhere() {
        UserContext.setApiToken(ANALYST_ID, TOKEN_ID, Set.of());

        assertThrows(IllegalArgumentException.class, () -> access.requireSqlExecute("SELECT 1"));
        assertThrows(IllegalArgumentException.class, () -> endpoints.updateSettings());
    }

    @Test
    void tokenScopeCannotEscalateToAdmin() {
        UserContext.setApiToken(ADMIN_ID, TOKEN_ID, Set.of(ApiTokenScopes.SQL_WRITE, ApiTokenScopes.MIGRATION));

        assertThrows(UnauthorizedException.class, () -> adminPolicy.requireAdminUser());
    }

    @Test
    void sessionUserIsAuthorizedByRbacNotScope() {
        // Registered, non-admin, without memberships -> readonly preset (dangerous SQL off).
        UserContext.set(ANALYST_ID, false, "session-it");

        assertDoesNotThrow(() -> access.requireSqlExecute("SELECT 1"));
        assertEquals(
                "PERMISSION_DENIED",
                assertThrows(
                        IllegalArgumentException.class,
                        () -> access.requireSqlExecute("DELETE FROM orders"))
                        .getMessage());
        assertThrows(IllegalArgumentException.class, () -> endpoints.updateSettings());
    }

    @Test
    void explicitUserGrantOverridesReadonlyPreset() {
        UserEntity analyst = userStore.findById(ANALYST_ID).orElseThrow();
        analyst.setFeaturePermissions(Map.of(UserFeaturePermission.SETTINGS_BASIC, true));
        userStore.saveUser(analyst);
        UserContext.set(ANALYST_ID, false, "session-it");

        assertEquals("saved", endpoints.updateSettings());
        assertTrue(userStore.findById(ANALYST_ID).orElseThrow()
                .getFeaturePermissions().get(UserFeaturePermission.SETTINGS_BASIC));
    }

    private static UserEntity registeredUser(long id, String username) {
        UserEntity user = new UserEntity();
        user.setId(id);
        user.setUsername(username);
        user.setGuest(false);
        return user;
    }

    /** Guarded surface mirroring how controllers declare the gate. */
    interface GuardedEndpoints {

        String runConsole(String sql);

        String updateSettings();
    }

    static class GuardedEndpointsImpl implements GuardedEndpoints {

        final AtomicBoolean consoleInvoked = new AtomicBoolean(false);

        @Override
        @RequiresFeature(UserFeaturePermission.WORKBENCH_CONSOLE_RUN)
        public String runConsole(String sql) {
            consoleInvoked.set(true);
            return "ran:" + sql;
        }

        @Override
        @RequiresFeature(UserFeaturePermission.SETTINGS_BASIC)
        public String updateSettings() {
            return "saved";
        }
    }
}
