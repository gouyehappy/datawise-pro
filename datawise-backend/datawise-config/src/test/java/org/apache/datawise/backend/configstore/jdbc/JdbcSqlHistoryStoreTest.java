package org.apache.datawise.backend.configstore.jdbc;

import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import org.apache.datawise.backend.configstore.SqlHistoryLimits;
import org.apache.datawise.backend.domain.TenantIds;
import org.apache.datawise.backend.model.SqlHistoryEntity;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

import java.time.Instant;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;

class JdbcSqlHistoryStoreTest {

    private HikariDataSource dataSource;
    private JdbcSqlHistoryStore store;

    @BeforeEach
    void setUp() {
        HikariConfig hikari = new HikariConfig();
        hikari.setJdbcUrl("jdbc:h2:mem:jdbc_sql_hist_" + System.nanoTime() + ";MODE=PostgreSQL;DB_CLOSE_DELAY=-1");
        hikari.setUsername("sa");
        hikari.setPassword("");
        dataSource = new HikariDataSource(hikari);
        Flyway.configure()
                .dataSource(dataSource)
                .locations("classpath:db/metadata/migration")
                .load()
                .migrate();
        store = new JdbcSqlHistoryStore(new JdbcTemplate(dataSource));
    }

    @AfterEach
    void tearDown() {
        if (dataSource != null) {
            dataSource.close();
        }
    }

    @Test
    void saveAndQueryByUser() {
        store.save(entry("l-1", 1L, "SELECT 1"));
        store.save(entry("l-2", 2L, "SELECT 2"));
        store.save(entry("l-3", 1L, "SELECT 3"));

        assertEquals(2, store.findByUserId(1L).size());
        assertEquals("l-3", store.findByUserId(1L).get(0).getId());
        assertEquals(1, store.findByUserId(2L).size());
        assertEquals(3, store.findByUserIds(List.of(1L, 2L)).size());

        store.replaceAll(List.of(entry("l-9", 9L, "SELECT 9")));
        assertEquals(0, store.findByUserId(1L).size());
        assertEquals("SELECT 9", store.findByUserId(9L).get(0).getSqlText());
    }

    @Test
    void trimsUserHistoryToFreeCap() {
        int over = SqlHistoryLimits.FREE_MAX_ENTRIES + 5;
        for (int i = 0; i < over; i++) {
            store.save(entry("l-cap-" + i, 42L, "SELECT " + i));
        }
        assertEquals(SqlHistoryLimits.FREE_MAX_ENTRIES, store.findByUserId(42L).size());
    }

    private static SqlHistoryEntity entry(String id, long userId, String sql) {
        SqlHistoryEntity entity = new SqlHistoryEntity();
        entity.setId(id);
        entity.setUserId(userId);
        entity.setConnectionId("conn-" + TenantIds.DEFAULT);
        entity.setDatabase("db");
        entity.setSqlText(sql);
        entity.setDurationMs(10L);
        entity.setRowCount(1);
        entity.setStatus("success");
        entity.setExecutedAt(Instant.now().plusMillis(id.hashCode()));
        return entity;
    }
}
