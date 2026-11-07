package org.apache.datawise.backend.backup;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import org.apache.datawise.backend.backup.model.BackupPolicy;
import org.apache.datawise.backend.config.AuthSessionProperties;
import org.apache.datawise.backend.configstore.AuthSessionPolicyService;
import org.apache.datawise.backend.configstore.ConfigDirectoryService;
import org.apache.datawise.backend.configstore.ConnectionStore;
import org.apache.datawise.backend.configstore.OidcConfigStore;
import org.apache.datawise.backend.configstore.OutboundWebhookStore;
import org.apache.datawise.backend.configstore.jdbc.JdbcApiTokenStore;
import org.apache.datawise.backend.configstore.jdbc.JdbcSessionStore;
import org.apache.datawise.backend.configstore.jdbc.JdbcSqlHistoryStore;
import org.apache.datawise.backend.configstore.jdbc.JdbcTeamStore;
import org.apache.datawise.backend.configstore.jdbc.JdbcTenantAiUsageStore;
import org.apache.datawise.backend.configstore.jdbc.JdbcTenantStore;
import org.apache.datawise.backend.configstore.jdbc.JdbcUserStore;
import org.apache.datawise.backend.configstore.team.TeamSnapshot;
import org.apache.datawise.backend.domain.TenantIds;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.apache.datawise.backend.model.ConnectionGroupEntity;
import org.apache.datawise.backend.model.OutboundWebhookEntity;
import org.apache.datawise.backend.model.TeamEntity;
import org.apache.datawise.backend.model.TenantEntity;
import org.apache.datawise.backend.model.UserEntity;
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
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class JdbcMetadataBackupRoundTripTest {

    @TempDir
    Path tempDir;

    private HikariDataSource dataSource;
    private JdbcTemplate jdbc;
    private JdbcMetadataBackupExporter exporter;
    private JdbcMetadataBackupImporter importer;
    private JdbcUserStore userStore;
    private JdbcTenantStore tenantStore;
    private JdbcTeamStore teamStore;

    @BeforeEach
    void setUp() throws Exception {
        Path dbFile = tempDir.resolve("metadata");
        HikariConfig hikari = new HikariConfig();
        hikari.setJdbcUrl("jdbc:h2:file:" + dbFile.toAbsolutePath() + ";MODE=PostgreSQL;DB_CLOSE_DELAY=-1");
        hikari.setUsername("sa");
        hikari.setPassword("");
        dataSource = new HikariDataSource(hikari);
        Flyway.configure()
                .dataSource(dataSource)
                .locations("classpath:db/metadata/migration")
                .load()
                .migrate();

        jdbc = new JdbcTemplate(dataSource);
        ObjectMapper objectMapper = new ObjectMapper().registerModule(new JavaTimeModule()).findAndRegisterModules();
        ConfigDirectoryService configDirectory = new ConfigDirectoryService(tempDir.resolve("config"));
        Files.createDirectories(tempDir.resolve("config"));

        userStore = new JdbcUserStore(jdbc, objectMapper);
        tenantStore = new JdbcTenantStore(jdbc, objectMapper);
        AuthSessionPolicyService sessionPolicy = new AuthSessionPolicyService(
                configDirectory, objectMapper, new AuthSessionProperties());
        JdbcSessionStore sessionStore = new JdbcSessionStore(jdbc, sessionPolicy);
        JdbcApiTokenStore apiTokenStore = new JdbcApiTokenStore(jdbc, objectMapper);
        teamStore = new JdbcTeamStore(jdbc, objectMapper);
        JdbcTenantAiUsageStore aiUsageStore = new JdbcTenantAiUsageStore(jdbc, objectMapper);
        JdbcSqlHistoryStore sqlHistoryStore = new JdbcSqlHistoryStore(jdbc);

        exporter = new JdbcMetadataBackupExporter(jdbc, objectMapper);
        importer = new JdbcMetadataBackupImporter(
                jdbc,
                objectMapper,
                userStore,
                sessionStore,
                tenantStore,
                apiTokenStore,
                teamStore,
                stubConnectionStore(),
                stubOidcStore(),
                stubOutboundWebhookStore(),
                aiUsageStore,
                sqlHistoryStore
        );
    }

    @AfterEach
    void tearDown() {
        if (dataSource != null) {
            dataSource.close();
        }
    }

    @Test
    void exportImport_roundTripsIdentityAndTeamSnapshot() throws Exception {
        UserEntity user = new UserEntity();
        user.setId(42L);
        user.setUsername("backup-admin");
        user.setPasswordHash("hash-v1");
        user.setDisplayName("Backup Admin");
        user.setGuest(false);
        user.setFeaturePermissions(Map.of("sql.console", true));
        user.setCreatedAt(Instant.parse("2026-01-01T00:00:00Z"));
        userStore.saveUser(user);

        TenantEntity tenant = new TenantEntity();
        tenant.setId(TenantIds.DEFAULT);
        tenant.setSlug(TenantIds.DEFAULT);
        tenant.setName("Default");
        tenant.setStatus("active");
        tenant.setCreatedAt(Instant.parse("2026-01-01T00:00:00Z"));
        tenantStore.saveTenant(tenant);

        TeamEntity team = new TeamEntity();
        team.setId("team-1");
        team.setName("Ops");
        team.setTenantId(TenantIds.DEFAULT);
        team.setOwnerUserId(42L);
        team.setCreatedAt(Instant.parse("2026-01-02T00:00:00Z"));
        teamStore.replaceSnapshot(TenantIds.DEFAULT, new TeamSnapshot(
                List.of(team), List.of(), List.of(), List.of(), List.of(), List.of(), List.of()
        ));

        Path staging = tempDir.resolve("staging");
        Files.createDirectories(staging);
        BackupPolicy policy = new BackupPolicy();
        policy.setIncludeSqlHistory(true);
        List<String> paths = exporter.exportTo(staging, policy);

        assertTrue(paths.contains("metadata/dw_users.json"));
        assertTrue(paths.contains("metadata/dw_tenants.json"));
        assertTrue(paths.contains("metadata/dw_team_snapshots.json"));
        assertTrue(Files.isRegularFile(staging.resolve("metadata/dw_users.json")));

        jdbc.update("DELETE FROM dw_team_snapshots");
        jdbc.update("DELETE FROM dw_tenants");
        jdbc.update("DELETE FROM dw_users");
        assertTrue(userStore.findByUsername("backup-admin").isEmpty());

        importer.apply(staging.resolve("metadata"), true);

        UserEntity restored = userStore.findByUsername("backup-admin").orElseThrow();
        assertEquals(42L, restored.getId());
        assertEquals("hash-v1", restored.getPasswordHash());
        assertEquals(true, restored.getFeaturePermissions().get("sql.console"));

        assertEquals("Default", tenantStore.findTenantById(TenantIds.DEFAULT).orElseThrow().getName());
        assertEquals(1, teamStore.listAllTeams().size());
        assertEquals("team-1", teamStore.listAllTeams().get(0).getId());
    }

    private static ConnectionStore stubConnectionStore() {
        return new ConnectionStore() {
            @Override
            public void ensureTenantFiles(String tenantId) {
            }

            @Override
            public Path connectionsFilePath() {
                return Path.of("connections.xml");
            }

            @Override
            public String readConnectionsXml() {
                return "";
            }

            @Override
            public List<ConnectionGroupEntity> findAllGroups() {
                return List.of();
            }

            @Override
            public List<ConnectionEntity> findAllConnections() {
                return List.of();
            }

            @Override
            public List<ConnectionGroupEntity> findRootGroups() {
                return List.of();
            }

            @Override
            public List<ConnectionGroupEntity> findChildGroups(String parentId) {
                return List.of();
            }

            @Override
            public void replaceAll(List<ConnectionGroupEntity> groups, List<ConnectionEntity> connections) {
            }

            @Override
            public void importConnectionsXml(String xml) {
            }

            @Override
            public Optional<ConnectionGroupEntity> findGroupById(String groupId) {
                return Optional.empty();
            }

            @Override
            public ConnectionGroupEntity saveGroup(ConnectionGroupEntity group) {
                return group;
            }

            @Override
            public void deleteGroupById(String groupId) {
            }

            @Override
            public Optional<ConnectionEntity> findConnectionById(String connectionId) {
                return Optional.empty();
            }

            @Override
            public List<ConnectionEntity> findConnectionsByGroupId(String groupId) {
                return List.of();
            }

            @Override
            public ConnectionEntity saveConnection(ConnectionEntity connection) {
                return connection;
            }

            @Override
            public void deleteConnectionById(String connectionId) {
            }

            @Override
            public int migratePlaintextSecretsIfNeeded() {
                return 0;
            }
        };
    }

    private static OidcConfigStore stubOidcStore() {
        return new OidcConfigStore() {
            @Override
            public void ensureTenantFiles(String tenantId) {
            }

            @Override
            public StoredOidcConfig current() {
                return StoredOidcConfig.disabledDefaults();
            }

            @Override
            public StoredOidcConfig save(StoredOidcConfig next) {
                return next;
            }
        };
    }

    private static OutboundWebhookStore stubOutboundWebhookStore() {
        return new OutboundWebhookStore() {
            @Override
            public List<OutboundWebhookEntity> listByTenantId(String tenantId) {
                return List.of();
            }

            @Override
            public List<OutboundWebhookEntity> listByUserId(long userId) {
                return List.of();
            }

            @Override
            public Optional<OutboundWebhookEntity> findById(String tenantId, String id) {
                return Optional.empty();
            }

            @Override
            public Optional<OutboundWebhookEntity> findById(long userId, String id) {
                return Optional.empty();
            }

            @Override
            public OutboundWebhookEntity save(String tenantId, OutboundWebhookEntity entity) {
                return entity;
            }

            @Override
            public OutboundWebhookEntity save(long userId, OutboundWebhookEntity entity) {
                return entity;
            }

            @Override
            public void delete(String tenantId, String id) {
            }

            @Override
            public void delete(long userId, String id) {
            }
        };
    }
}
