package org.apache.datawise.backend.configstore;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import org.apache.datawise.backend.model.AiTableTagEntry;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Path;
import java.time.Instant;
import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class UserAiTableTagStoreTest {

    @TempDir
    Path configRoot;

    @Test
    void replaceScopedReplacesExistingTagForSameTable() {
        UserAiTableTagStore store = store();

        AiTableTagEntry first = entry("old-id", "conn-1", "shop", "orders");
        AiTableTagEntry second = entry("new-id", "conn-1", "shop", "orders");
        store.replaceScoped(1L, first);
        store.replaceScoped(1L, second);

        List<AiTableTagEntry> scoped = store.listScoped(1L, "conn-1", "shop");
        assertEquals(1, scoped.size());
        assertEquals("new-id", scoped.get(0).getId());
        assertEquals("orders", scoped.get(0).getTableName());
    }

    @Test
    void removeScopedDeletesByConnectionDatabaseAndTableName() {
        UserAiTableTagStore store = store();

        store.replaceScoped(1L, entry("tag-1", "conn-1", "shop", "orders"));
        store.replaceScoped(1L, entry("tag-2", "conn-1", "shop", "users"));
        store.replaceScoped(1L, entry("tag-3", "conn-1", "crm", "accounts"));

        store.removeScoped(1L, "conn-1", "shop", "orders");

        List<AiTableTagEntry> shop = store.listScoped(1L, "conn-1", "shop");
        assertEquals(1, shop.size());
        assertEquals("users", shop.get(0).getTableName());

        List<AiTableTagEntry> all = store.listAll(1L);
        assertEquals(2, all.size());
        assertTrue(all.stream().anyMatch(entry -> "accounts".equals(entry.getTableName())));
    }

    @Test
    void removeByConnectionIdDropsAllTagsForConnection() {
        UserAiTableTagStore store = store();
        store.replaceScoped(1L, entry("tag-1", "conn-1", "shop", "orders"));
        store.replaceScoped(1L, entry("tag-2", "conn-1", "crm", "accounts"));
        store.replaceScoped(1L, entry("tag-3", "conn-2", "shop", "orders"));

        store.removeByConnectionId(1L, "conn-1");

        List<AiTableTagEntry> all = store.listAll(1L);
        assertEquals(1, all.size());
        assertEquals("conn-2", all.get(0).getConnectionId());
    }

    @Test
    void removeMissingConnectionsPrunesOrphans() {
        UserAiTableTagStore store = store();
        store.replaceScoped(1L, entry("tag-1", "conn-1", "shop", "orders"));
        store.replaceScoped(1L, entry("tag-2", "conn-gone", "shop", "users"));

        int removed = store.removeMissingConnections(1L, Set.of("conn-1"));

        assertEquals(1, removed);
        List<AiTableTagEntry> all = store.listAll(1L);
        assertEquals(1, all.size());
        assertEquals("conn-1", all.get(0).getConnectionId());
    }

    private UserAiTableTagStore store() {
        return new UserAiTableTagStore(
                new ConfigDirectoryService(configRoot),
                new ObjectMapper().registerModule(new JavaTimeModule()));
    }

    private static AiTableTagEntry entry(String id, String connectionId, String database, String tableName) {
        AiTableTagEntry entry = new AiTableTagEntry();
        entry.setId(id);
        entry.setConnectionId(connectionId);
        entry.setDatabase(database);
        entry.setTableName(tableName);
        entry.setUpdatedAt(Instant.parse("2026-01-01T00:00:00Z"));
        return entry;
    }
}
