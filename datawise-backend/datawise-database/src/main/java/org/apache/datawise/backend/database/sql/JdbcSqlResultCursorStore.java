package org.apache.datawise.backend.database.sql;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.datawise.backend.common.SqlCursorGoneException;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Shared JDBC cursor store ({@code dw_sql_cursors}) for multi-replica paging without sticky.
 * Cursors that reference an open manual TX session still need sticky for the Connection.
 */
public class JdbcSqlResultCursorStore implements SqlResultCursorStore {

    private static final TypeReference<List<Map<String, Object>>> COLUMNS_TYPE = new TypeReference<>() {
    };

    private final JdbcTemplate jdbc;
    private final ObjectMapper objectMapper;

    public JdbcSqlResultCursorStore(JdbcTemplate jdbc, ObjectMapper objectMapper) {
        this.jdbc = jdbc;
        this.objectMapper = objectMapper != null ? objectMapper : new ObjectMapper();
    }

    @Override
    public String create(
            long userId,
            String connectionId,
            String database,
            String sql,
            String sessionKey,
            int pageSize,
            int nextOffset,
            List<Map<String, Object>> columns
    ) {
        evictExpired();
        enforceMaxCursors();
        String id = UUID.randomUUID().toString();
        Timestamp now = Timestamp.from(Instant.now());
        jdbc.update(
                """
                        INSERT INTO dw_sql_cursors (
                            cursor_id, user_id, connection_id, database_name, sql_text, session_key,
                            page_size, next_offset, columns_json, last_accessed_at
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                id,
                userId,
                connectionId,
                database,
                sql,
                sessionKey,
                pageSize,
                nextOffset,
                writeColumns(columns),
                now
        );
        return id;
    }

    @Override
    public CursorEntry require(long userId, String cursorId) {
        CursorRow row;
        try {
            row = jdbc.queryForObject(
                    """
                            SELECT user_id, connection_id, database_name, sql_text, session_key,
                                   page_size, next_offset, columns_json, last_accessed_at
                            FROM dw_sql_cursors WHERE cursor_id = ?
                            """,
                    (rs, rowNum) -> new CursorRow(
                            rs.getLong("user_id"),
                            rs.getString("connection_id"),
                            rs.getString("database_name"),
                            rs.getString("sql_text"),
                            rs.getString("session_key"),
                            rs.getInt("page_size"),
                            rs.getInt("next_offset"),
                            rs.getString("columns_json"),
                            rs.getTimestamp("last_accessed_at").toInstant().toEpochMilli()
                    ),
                    cursorId
            );
        } catch (EmptyResultDataAccessException ex) {
            throw new SqlCursorGoneException();
        }
        if (row == null || row.userId != userId) {
            throw new SqlCursorGoneException();
        }
        if (System.currentTimeMillis() - row.lastAccessedAtMs > MemorySqlResultCursorStore.TTL_MS) {
            jdbc.update("DELETE FROM dw_sql_cursors WHERE cursor_id = ?", cursorId);
            throw new SqlCursorGoneException();
        }
        Timestamp now = Timestamp.from(Instant.now());
        jdbc.update(
                "UPDATE dw_sql_cursors SET last_accessed_at = ? WHERE cursor_id = ?",
                now,
                cursorId
        );
        return new CursorEntry(
                row.userId,
                row.connectionId,
                row.database,
                row.sql,
                row.sessionKey,
                row.pageSize,
                row.nextOffset,
                readColumns(row.columnsJson),
                now.toInstant().toEpochMilli()
        );
    }

    @Override
    public void updateOffset(String cursorId, int nextOffset) {
        jdbc.update(
                """
                        UPDATE dw_sql_cursors
                        SET next_offset = ?, last_accessed_at = ?
                        WHERE cursor_id = ?
                        """,
                nextOffset,
                Timestamp.from(Instant.now()),
                cursorId
        );
    }

    @Override
    public void remove(String cursorId) {
        if (cursorId == null || cursorId.isBlank()) {
            return;
        }
        jdbc.update("DELETE FROM dw_sql_cursors WHERE cursor_id = ?", cursorId);
    }

    @Override
    public void removeForUser(long userId, String cursorId) {
        if (cursorId == null || cursorId.isBlank()) {
            return;
        }
        jdbc.update(
                "DELETE FROM dw_sql_cursors WHERE cursor_id = ? AND user_id = ?",
                cursorId,
                userId
        );
    }

    @Scheduled(fixedRate = 60_000)
    void evictExpiredScheduled() {
        evictExpired();
    }

    private void evictExpired() {
        Timestamp cutoff = Timestamp.from(Instant.now().minusMillis(MemorySqlResultCursorStore.TTL_MS));
        jdbc.update("DELETE FROM dw_sql_cursors WHERE last_accessed_at < ?", cutoff);
    }

    private void enforceMaxCursors() {
        Integer count = jdbc.queryForObject("SELECT COUNT(*) FROM dw_sql_cursors", Integer.class);
        if (count == null || count < MemorySqlResultCursorStore.MAX_CURSORS) {
            return;
        }
        List<String> oldest = jdbc.query(
                """
                        SELECT cursor_id FROM dw_sql_cursors
                        ORDER BY last_accessed_at ASC
                        LIMIT 1
                        """,
                (rs, rowNum) -> rs.getString("cursor_id")
        );
        if (!oldest.isEmpty()) {
            jdbc.update("DELETE FROM dw_sql_cursors WHERE cursor_id = ?", oldest.get(0));
        }
    }

    private String writeColumns(List<Map<String, Object>> columns) {
        try {
            return objectMapper.writeValueAsString(columns != null ? columns : List.of());
        } catch (JsonProcessingException ex) {
            throw new IllegalStateException("Failed to serialize cursor columns", ex);
        }
    }

    private List<Map<String, Object>> readColumns(String json) {
        if (json == null || json.isBlank()) {
            return Collections.emptyList();
        }
        try {
            List<Map<String, Object>> columns = objectMapper.readValue(json, COLUMNS_TYPE);
            return columns != null ? columns : Collections.emptyList();
        } catch (JsonProcessingException ex) {
            throw new IllegalStateException("Failed to deserialize cursor columns", ex);
        }
    }

    private record CursorRow(
            long userId,
            String connectionId,
            String database,
            String sql,
            String sessionKey,
            int pageSize,
            int nextOffset,
            String columnsJson,
            long lastAccessedAtMs
    ) {
    }
}
