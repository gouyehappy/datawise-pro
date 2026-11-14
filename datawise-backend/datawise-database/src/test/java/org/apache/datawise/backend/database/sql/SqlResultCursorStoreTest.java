package org.apache.datawise.backend.database.sql;

import org.apache.datawise.backend.common.SqlCursorGoneException;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Field;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class SqlResultCursorStoreTest {

    @Test
    void removeForUser_onlyRemovesOwnCursor() {
        MemorySqlResultCursorStore store = new MemorySqlResultCursorStore();
        String cursorId = store.create(1L, "conn-1", "shop", "select 1", "tab-1", 50, 0, List.of());

        store.removeForUser(2L, cursorId);
        assertEquals(1L, store.require(1L, cursorId).userId());

        store.removeForUser(1L, cursorId);
        assertThrows(SqlCursorGoneException.class, () -> store.require(1L, cursorId));
    }

    @Test
    void requireRefreshesAccessTime() {
        MemorySqlResultCursorStore store = new MemorySqlResultCursorStore();
        String cursorId = store.create(
                1L,
                "conn-1",
                "shop",
                "select 1",
                "tab-1",
                100,
                100,
                List.of(Map.of("name", "id"))
        );

        SqlResultCursorStore.CursorEntry first = store.require(1L, cursorId);
        SqlResultCursorStore.CursorEntry second = store.require(1L, cursorId);

        assertTrue(second.lastAccessedAtMs() >= first.lastAccessedAtMs());
    }

    @Test
    void requireRejectsOtherUser() {
        MemorySqlResultCursorStore store = new MemorySqlResultCursorStore();
        String cursorId = store.create(1L, "conn-1", "shop", "select 1", "tab-1", 50, 0, List.of());

        assertThrows(SqlCursorGoneException.class, () -> store.require(2L, cursorId));
    }

    @Test
    void evictExpiredScheduledRemovesStaleCursor() throws Exception {
        MemorySqlResultCursorStore store = new MemorySqlResultCursorStore();
        String cursorId = store.create(1L, "conn-1", "shop", "select 1", "tab-1", 50, 0, List.of());
        replaceLastAccessed(store, cursorId, System.currentTimeMillis() - (31L * 60L * 1000L));

        store.evictExpiredScheduled();

        assertThrows(SqlCursorGoneException.class, () -> store.require(1L, cursorId));
    }

    @Test
    void createEvictsOldestWhenAtCapacity() throws Exception {
        MemorySqlResultCursorStore store = new MemorySqlResultCursorStore();
        String oldestId = store.create(1L, "conn-1", "shop", "select 1", "tab-1", 50, 0, List.of());
        replaceLastAccessed(store, oldestId, 1L);
        for (int i = 0; i < 511; i++) {
            store.create(1L, "conn-1", "shop", "select " + i, "tab-" + i, 50, 0, List.of());
        }

        store.create(1L, "conn-1", "shop", "select overflow", "tab-overflow", 50, 0, List.of());

        assertThrows(SqlCursorGoneException.class, () -> store.require(1L, oldestId));
    }

    @SuppressWarnings("unchecked")
    private static void replaceLastAccessed(MemorySqlResultCursorStore store, String cursorId, long lastAccessedAtMs)
            throws Exception {
        Field entriesField = MemorySqlResultCursorStore.class.getDeclaredField("entries");
        entriesField.setAccessible(true);
        ConcurrentHashMap<String, SqlResultCursorStore.CursorEntry> entries =
                (ConcurrentHashMap<String, SqlResultCursorStore.CursorEntry>) entriesField.get(store);
        SqlResultCursorStore.CursorEntry entry = entries.get(cursorId);
        entries.put(
                cursorId,
                new SqlResultCursorStore.CursorEntry(
                        entry.userId(),
                        entry.connectionId(),
                        entry.database(),
                        entry.sql(),
                        entry.sessionKey(),
                        entry.pageSize(),
                        entry.nextOffset(),
                        entry.columns(),
                        lastAccessedAtMs
                )
        );
    }
}
