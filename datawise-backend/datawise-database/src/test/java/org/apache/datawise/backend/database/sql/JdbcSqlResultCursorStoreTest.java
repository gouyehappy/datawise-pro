package org.apache.datawise.backend.database.sql;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import org.apache.datawise.backend.common.SqlCursorGoneException;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class JdbcSqlResultCursorStoreTest {

    private HikariDataSource dataSource;
    private JdbcSqlResultCursorStore store;

    @BeforeEach
    void setUp() {
        HikariConfig hikari = new HikariConfig();
        hikari.setJdbcUrl("jdbc:h2:mem:sql_cursors_" + System.nanoTime() + ";MODE=PostgreSQL;DB_CLOSE_DELAY=-1");
        hikari.setUsername("sa");
        hikari.setPassword("");
        dataSource = new HikariDataSource(hikari);
        Flyway.configure()
                .dataSource(dataSource)
                .locations("classpath:db/metadata/migration")
                .baselineOnMigrate(true)
                .load()
                .migrate();
        store = new JdbcSqlResultCursorStore(new JdbcTemplate(dataSource), new ObjectMapper());
    }

    @AfterEach
    void tearDown() {
        if (dataSource != null) {
            dataSource.close();
        }
    }

    @Test
    void createRequireUpdateVisibleAcrossStoreInstances() {
        String cursorId = store.create(
                1L,
                "conn-1",
                "shop",
                "select id from t",
                null,
                50,
                50,
                List.of(Map.of("name", "id"))
        );

        JdbcSqlResultCursorStore other = new JdbcSqlResultCursorStore(
                new JdbcTemplate(dataSource), new ObjectMapper());
        SqlResultCursorStore.CursorEntry entry = other.require(1L, cursorId);
        assertEquals("select id from t", entry.sql());
        assertEquals(50, entry.nextOffset());
        assertEquals("id", entry.columns().get(0).get("name"));

        other.updateOffset(cursorId, 100);
        assertEquals(100, store.require(1L, cursorId).nextOffset());
    }

    @Test
    void requireRejectsOtherUserAndRemoveForUser() {
        String cursorId = store.create(1L, "conn-1", "shop", "select 1", "tab-1", 50, 0, List.of());
        assertThrows(SqlCursorGoneException.class, () -> store.require(2L, cursorId));

        store.removeForUser(2L, cursorId);
        assertEquals(1L, store.require(1L, cursorId).userId());

        store.removeForUser(1L, cursorId);
        assertThrows(SqlCursorGoneException.class, () -> store.require(1L, cursorId));
    }

    @Test
    void evictExpiredScheduledRemovesStaleCursor() {
        String cursorId = store.create(1L, "conn-1", "shop", "select 1", "tab-1", 50, 0, List.of());
        Timestamp stale = Timestamp.from(Instant.now().minusMillis(MemorySqlResultCursorStore.TTL_MS + 60_000L));
        new JdbcTemplate(dataSource).update(
                "UPDATE dw_sql_cursors SET last_accessed_at = ? WHERE cursor_id = ?",
                stale,
                cursorId
        );

        store.evictExpiredScheduled();

        assertThrows(SqlCursorGoneException.class, () -> store.require(1L, cursorId));
    }

    @Test
    void createEvictsOldestWhenAtCapacity() {
        String oldestId = store.create(1L, "conn-1", "shop", "select oldest", "tab-0", 50, 0, List.of());
        Timestamp ancient = Timestamp.from(Instant.ofEpochMilli(1L));
        new JdbcTemplate(dataSource).update(
                "UPDATE dw_sql_cursors SET last_accessed_at = ? WHERE cursor_id = ?",
                ancient,
                oldestId
        );
        for (int i = 0; i < MemorySqlResultCursorStore.MAX_CURSORS - 1; i++) {
            store.create(1L, "conn-1", "shop", "select " + i, "tab-" + i, 50, 0, List.of());
        }

        store.create(1L, "conn-1", "shop", "select overflow", "tab-overflow", 50, 0, List.of());

        assertThrows(SqlCursorGoneException.class, () -> store.require(1L, oldestId));
        assertTrue(store.require(1L,
                new JdbcTemplate(dataSource).queryForObject(
                        "SELECT cursor_id FROM dw_sql_cursors WHERE sql_text = ?",
                        String.class,
                        "select overflow"
                )).sql().contains("overflow"));
    }
}
