package org.apache.datawise.backend.database.sql;

import java.util.List;
import java.util.Map;

/**
 * Paged SQL result cursor metadata (SQL + offset + columns). Implementations may be
 * process-local or shared JDBC ({@code datawise.query.cursor-store-type}).
 */
public interface SqlResultCursorStore {

    record CursorEntry(
            long userId,
            String connectionId,
            String database,
            String sql,
            String sessionKey,
            int pageSize,
            int nextOffset,
            List<Map<String, Object>> columns,
            long lastAccessedAtMs
    ) {
    }

    String create(
            long userId,
            String connectionId,
            String database,
            String sql,
            String sessionKey,
            int pageSize,
            int nextOffset,
            List<Map<String, Object>> columns
    );

    CursorEntry require(long userId, String cursorId);

    void updateOffset(String cursorId, int nextOffset);

    void remove(String cursorId);

    /** Removes a cursor only when it belongs to {@code userId} (no-op otherwise). */
    void removeForUser(long userId, String cursorId);
}
