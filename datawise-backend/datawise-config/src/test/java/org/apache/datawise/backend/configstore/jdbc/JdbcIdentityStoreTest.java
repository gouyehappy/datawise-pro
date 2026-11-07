package org.apache.datawise.backend.configstore.jdbc;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import org.apache.datawise.backend.config.AuthSessionProperties;
import org.apache.datawise.backend.configstore.AuthSessionPolicyService;
import org.apache.datawise.backend.configstore.ConfigDirectoryService;
import org.apache.datawise.backend.configstore.FileUserStore;
import org.apache.datawise.backend.domain.TenantIds;
import org.apache.datawise.backend.model.TenantEntity;
import org.apache.datawise.backend.model.TenantRoleEntity;
import org.apache.datawise.backend.model.UserEntity;
import org.apache.datawise.backend.model.UserTenantMembership;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.jdbc.core.JdbcTemplate;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class JdbcIdentityStoreTest {

    @TempDir
    Path tempDir;

    private HikariDataSource dataSource;
    private JdbcUserStore userStore;
    private JdbcTenantStore tenantStore;
    private JdbcSessionStore sessionStore;
    private ObjectMapper objectMapper;

    @BeforeEach
    void setUp() {
        objectMapper = new ObjectMapper().findAndRegisterModules();
        HikariConfig hikari = new HikariConfig();
        hikari.setJdbcUrl("jdbc:h2:mem:jdbc_identity_test_" + System.nanoTime() + ";MODE=PostgreSQL;DB_CLOSE_DELAY=-1");
        hikari.setUsername("sa");
        hikari.setPassword("");
        dataSource = new HikariDataSource(hikari);
        Flyway.configure()
                .dataSource(dataSource)
                .locations("classpath:db/metadata/migration")
                .load()
                .migrate();
        JdbcTemplate jdbc = new JdbcTemplate(dataSource);
        userStore = new JdbcUserStore(jdbc, objectMapper);
        tenantStore = new JdbcTenantStore(jdbc, objectMapper);
        ConfigDirectoryService configDirectory = new ConfigDirectoryService(tempDir);
        AuthSessionPolicyService policy = new AuthSessionPolicyService(
                configDirectory, objectMapper, new AuthSessionProperties());
        sessionStore = new JdbcSessionStore(jdbc, policy);
    }

    @AfterEach
    void tearDown() {
        if (dataSource != null) {
            dataSource.close();
        }
    }

    @Test
    void userAndTenant_roundTrip() {
        UserEntity user = new UserEntity();
        user.setId(1L);
        user.setUsername("admin");
        user.setPasswordHash("hash");
        user.setGuest(false);
        user.setFeaturePermissions(Map.of("sql.console", true));
        userStore.saveUser(user);

        assertEquals("admin", userStore.findByUsername("admin").orElseThrow().getUsername());
        assertEquals(true, userStore.findById(1L).orElseThrow().getFeaturePermissions().get("sql.console"));

        TenantEntity tenant = new TenantEntity();
        tenant.setId(TenantIds.DEFAULT);
        tenant.setSlug(TenantIds.DEFAULT);
        tenant.setName("Default");
        tenant.setStatus("active");
        tenant.setCreatedAt(Instant.now());
        tenantStore.saveTenant(tenant);

        TenantRoleEntity role = new TenantRoleEntity();
        role.setId(TenantIds.ROLE_ID_DEVELOPER);
        role.setTenantId(TenantIds.DEFAULT);
        role.setKey(TenantIds.ROLE_DEVELOPER);
        role.setName("Developer");
        role.setSystem(true);
        role.setPermissions(Map.of("sql.console", true));
        tenantStore.saveRole(role);

        UserTenantMembership membership = new UserTenantMembership();
        membership.setUserId(1L);
        membership.setTenantId(TenantIds.DEFAULT);
        membership.setStatus("active");
        membership.setRoleIds(List.of(TenantIds.ROLE_ID_DEVELOPER));
        membership.setJoinedAt(Instant.now());
        tenantStore.saveMembership(membership);

        assertTrue(tenantStore.hasRoleKey(1L, TenantIds.DEFAULT, TenantIds.ROLE_DEVELOPER));
        assertTrue(tenantStore.resolveRolePermissions(1L, TenantIds.DEFAULT).orElseThrow().get("sql.console"));
    }

    @Test
    void fileImport_isIdempotent() throws Exception {
        ConfigDirectoryService configDirectory = new ConfigDirectoryService(tempDir);
        FileUserStore fileUsers = new FileUserStore(configDirectory, objectMapper);
        UserEntity user = new UserEntity();
        user.setId(9L);
        user.setUsername("imported");
        user.setPasswordHash("x");
        user.setGuest(false);
        fileUsers.saveUser(user);

        JdbcTemplate jdbc = new JdbcTemplate(dataSource);
        JdbcApiTokenStore tokenStore = new JdbcApiTokenStore(jdbc, objectMapper);
        JdbcConnectionStore jdbcConnections = new JdbcConnectionStore(
                jdbc, configDirectory, objectMapper, org.apache.datawise.backend.security.SecretTestSupport.testCodec());
        MetadataFileImportRunner importer = new MetadataFileImportRunner(
                jdbc, configDirectory, objectMapper, userStore, sessionStore, tenantStore, tokenStore,
                new JdbcTeamStore(jdbc, objectMapper),
                jdbcConnections,
                new JdbcOidcConfigStore(jdbc, objectMapper),
                new JdbcOutboundWebhookStore(jdbc, objectMapper),
                new JdbcTenantAiUsageStore(jdbc),
                new JdbcSqlHistoryStore(jdbc));
        importer.run(null);
        importer.run(null);

        assertEquals("imported", userStore.findById(9L).orElseThrow().getUsername());
        Integer markers = jdbc.queryForObject(
                "SELECT COUNT(*) FROM dw_metadata_import WHERE id = 'file-v1'", Integer.class);
        assertEquals(1, markers);
        assertTrue(Files.isRegularFile(tempDir.resolve("users.json")));
    }
}
