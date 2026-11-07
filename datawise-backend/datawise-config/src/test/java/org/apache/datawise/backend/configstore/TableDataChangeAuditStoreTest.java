package org.apache.datawise.backend.configstore;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.datawise.backend.domain.TableDataChangeAuditEntry;
import org.apache.datawise.backend.service.UserResourcePolicy;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.nio.file.Path;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.doNothing;

@ExtendWith(MockitoExtension.class)
class TableDataChangeAuditStoreTest {

    @TempDir
    Path tempDir;

    @Mock
    private UserResourcePolicy resourcePolicy;

    private TableDataChangeAuditStore store;

    @BeforeEach
    void setUp() {
        ConfigDirectoryService configDirectory = new ConfigDirectoryService(tempDir);
        ObjectMapper objectMapper = new ObjectMapper().findAndRegisterModules();
        store = new TableDataChangeAuditStore(configDirectory, objectMapper, resourcePolicy);
        doNothing().when(resourcePolicy).requireWrite(org.apache.datawise.backend.service.UserResource.TABLE_DATA_AUDIT);
    }

    @Test
    void appendAndList_returnsNewestFirst() {
        store.append(1L, "conn-a", "db1", "users", entry("audit-1", 100L, TableDataChangeAuditEntry.OP_INSERT));
        store.append(1L, "conn-a", "db1", "users", entry("audit-2", 200L, TableDataChangeAuditEntry.OP_UPDATE));

        List<TableDataChangeAuditEntry> listed = store.list(1L, "conn-a", "db1", "users", 10);

        assertEquals(2, listed.size());
        assertEquals("audit-2", listed.get(0).id());
        assertEquals("audit-1", listed.get(1).id());
    }

    @Test
    void markReverted_updatesEntryFlag() {
        store.append(1L, "conn-a", "db1", "orders", entry("audit-3", 300L, TableDataChangeAuditEntry.OP_DELETE));

        store.markReverted(1L, "conn-a", "db1", "orders", "audit-3");

        TableDataChangeAuditEntry found = store.find(1L, "conn-a", "db1", "orders", "audit-3");
        assertTrue(found.reverted());
    }

    @Test
    void scopeKey_isolatesConnectionsAndTables() {
        store.append(1L, "conn-a", "db1", "users", entry("audit-a", 100L, TableDataChangeAuditEntry.OP_INSERT));
        store.append(1L, "conn-b", "db1", "users", entry("audit-b", 100L, TableDataChangeAuditEntry.OP_INSERT));

        assertFalse(store.list(1L, "conn-a", "db1", "users", 10).isEmpty());
        assertFalse(store.list(1L, "conn-b", "db1", "users", 10).isEmpty());
        assertTrue(store.list(1L, "conn-a", "db1", "orders", 10).isEmpty());
    }

    private static TableDataChangeAuditEntry entry(String id, long createdAtMs, String operation) {
        return new TableDataChangeAuditEntry(
                id,
                createdAtMs,
                operation,
                Map.of("id", 1),
                Map.of("id", 1, "name", "x"),
                Map.of("id", 1),
                false,
                null);
    }
}
