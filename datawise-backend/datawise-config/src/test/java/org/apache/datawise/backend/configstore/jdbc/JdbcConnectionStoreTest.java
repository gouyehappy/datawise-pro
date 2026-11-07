package org.apache.datawise.backend.configstore.jdbc;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import org.apache.datawise.backend.common.ConnectionCatalogConflictException;
import org.apache.datawise.backend.configstore.ConfigDirectoryService;
import org.apache.datawise.backend.domain.TenantIds;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.apache.datawise.backend.model.ConnectionGroupEntity;
import org.apache.datawise.backend.security.SecretTestSupport;
import org.apache.datawise.backend.security.UserContext;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.jdbc.core.JdbcTemplate;

import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;

class JdbcConnectionStoreTest {

    @TempDir
    Path tempDir;

    private HikariDataSource dataSource;
    private JdbcConnectionStore store;

    @BeforeEach
    void setUp() {
        HikariConfig hikari = new HikariConfig();
        hikari.setJdbcUrl("jdbc:h2:mem:jdbc_conn_test_" + System.nanoTime() + ";MODE=PostgreSQL;DB_CLOSE_DELAY=-1");
        hikari.setUsername("sa");
        hikari.setPassword("");
        dataSource = new HikariDataSource(hikari);
        Flyway.configure()
                .dataSource(dataSource)
                .locations("classpath:db/metadata/migration")
                .load()
                .migrate();
        store = new JdbcConnectionStore(
                new JdbcTemplate(dataSource),
                new ConfigDirectoryService(tempDir),
                new ObjectMapper().findAndRegisterModules(),
                SecretTestSupport.testCodec());
    }

    @AfterEach
    void tearDown() {
        UserContext.clear();
        if (dataSource != null) {
            dataSource.close();
        }
    }

    @Test
    void connectionsAreIsolatedByTenantAndSecretsEncrypted() throws Exception {
        UserContext.set(1L, false, "s1", TenantIds.DEFAULT);
        saveGroupAndConn("group-default", "conn-default", "Default DB", "plain-secret");

        UserContext.set(1L, false, "s1", "acme");
        store.ensureTenantFiles("acme");
        saveGroupAndConn("group-acme", "conn-acme", "Acme DB", "acme-secret");

        assertEquals(1, store.findAllConnections().size());
        assertEquals("conn-acme", store.findAllConnections().get(0).getId());
        assertEquals("acme-secret", store.findConnectionById("conn-acme").orElseThrow().getPassword());
        assertFalse(store.readConnectionsXml().contains("acme-secret"));

        UserContext.set(1L, false, "s1", TenantIds.DEFAULT);
        assertEquals(1, store.findAllConnections().size());
        assertEquals("conn-default", store.findAllConnections().get(0).getId());
        assertEquals("plain-secret", store.findConnectionById("conn-default").orElseThrow().getPassword());
    }

    @Test
    void rejectsStaleOptimisticVersionOnWrite() {
        UserContext.set(1L, false, "s1", TenantIds.DEFAULT);
        saveGroupAndConn("group-default", "conn-default", "Default DB", "plain-secret");

        JdbcTemplate jdbc = new JdbcTemplate(dataSource);
        Long version = jdbc.queryForObject(
                "SELECT version FROM dw_connection_snapshots WHERE tenant_id = ?",
                Long.class,
                TenantIds.DEFAULT);
        long stale = (version == null ? 1L : version) - 1L;

        IllegalStateException ex = assertThrows(IllegalStateException.class, () -> {
            int updated = jdbc.update(
                    "UPDATE dw_connection_snapshots SET payload = ?, version = ?, updated_at = CURRENT_TIMESTAMP "
                            + "WHERE tenant_id = ? AND version = ?",
                    "<?xml version=\"1.0\"?><datawise-connections version=\"1\"/>",
                    stale + 1,
                    TenantIds.DEFAULT,
                    stale);
            if (updated == 0) {
                throw new ConnectionCatalogConflictException();
            }
        });
        assertEquals(ConnectionCatalogConflictException.CODE, ex.getMessage());
    }

    private void saveGroupAndConn(String groupId, String connId, String name, String password) {
        ConnectionGroupEntity group = new ConnectionGroupEntity();
        group.setId(groupId);
        group.setLabel(name);
        group.setUserId(1L);
        group.setSortOrder(0);
        store.saveGroup(group);

        ConnectionEntity connection = new ConnectionEntity();
        connection.setId(connId);
        connection.setGroupId(groupId);
        connection.setName(name);
        connection.setUserId(1L);
        connection.setDbType("mysql");
        connection.setPassword(password);
        store.saveConnection(connection);
    }
}
