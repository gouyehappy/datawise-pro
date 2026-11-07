package org.apache.datawise.backend.database.table;

import org.apache.datawise.backend.configstore.TableDataChangeAuditStore;
import org.apache.datawise.backend.domain.TableDataChangeAuditEntry;
import org.apache.datawise.backend.domain.TableRowMutateResult;
import org.apache.datawise.backend.database.context.ConnectionExecutionContext;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class TableDataChangeAuditServiceTest {

    @Mock
    private TableDataChangeAuditStore store;
    @Mock
    private TableDataRowLookup rowLookup;
    @Mock
    private TableDataMutationService mutationService;
    @Mock
    private ConnectionExecutionContext connectionContext;

    private TableDataChangeAuditService service;

    @BeforeEach
    void setUp() {
        service = new TableDataChangeAuditService(
                store,
                rowLookup,
                mutationService,
                connectionContext
        );
    }

    @Test
    void restore_update_appliesInverseDiff() {
        Map<String, Object> primaryKey = Map.of("id", 1);
        Map<String, Object> beforeRow = Map.of("id", 1, "name", "Alice");
        Map<String, Object> afterRow = Map.of("id", 1, "name", "Bob");
        TableDataChangeAuditEntry entry = new TableDataChangeAuditEntry(
                "audit-1",
                100L,
                TableDataChangeAuditEntry.OP_UPDATE,
                beforeRow,
                afterRow,
                primaryKey,
                false,
                null
        );
        when(connectionContext.requireUserId()).thenReturn(7L);
        when(store.find(7L, "conn-1", "shop", "users", "audit-1")).thenReturn(entry);
        when(mutationService.updateRow(
                "users",
                "conn-1",
                "shop",
                primaryKey,
                Map.of("name", "Alice")
        )).thenReturn(new TableRowMutateResult(1, "UPDATE users SET name='Alice' WHERE id=1"));

        TableRowMutateResult result = service.restoreForCurrentUser("users", "conn-1", "shop", "audit-1");

        assertEquals(1, result.affectedRows());
        verify(store).markReverted(7L, "conn-1", "shop", "users", "audit-1");
        ArgumentCaptor<TableDataChangeAuditEntry> restoreCaptor = ArgumentCaptor.forClass(TableDataChangeAuditEntry.class);
        verify(store).append(eq(7L), eq("conn-1"), eq("shop"), eq("users"), restoreCaptor.capture());
        assertEquals(TableDataChangeAuditEntry.OP_RESTORE, restoreCaptor.getValue().operation());
        assertEquals("audit-1", restoreCaptor.getValue().restoredFromId());
    }

    @Test
    void restore_delete_reinsertsBeforeRow() {
        Map<String, Object> beforeRow = Map.of("id", 2, "name", "Bob");
        TableDataChangeAuditEntry entry = new TableDataChangeAuditEntry(
                "audit-del",
                100L,
                TableDataChangeAuditEntry.OP_DELETE,
                beforeRow,
                null,
                Map.of("id", 2),
                false,
                null
        );
        when(connectionContext.requireUserId()).thenReturn(7L);
        when(store.find(7L, "conn-1", "shop", "users", "audit-del")).thenReturn(entry);
        when(mutationService.insertRow("users", "conn-1", "shop", beforeRow))
                .thenReturn(new TableRowMutateResult(1, "INSERT ..."));

        TableRowMutateResult result = service.restoreForCurrentUser("users", "conn-1", "shop", "audit-del");

        assertEquals(1, result.affectedRows());
        verify(store).markReverted(7L, "conn-1", "shop", "users", "audit-del");
    }

    @Test
    void restore_rejectsAlreadyRevertedEntry() {
        TableDataChangeAuditEntry entry = new TableDataChangeAuditEntry(
                "audit-2",
                100L,
                TableDataChangeAuditEntry.OP_DELETE,
                Map.of("id", 2),
                null,
                Map.of("id", 2),
                true,
                null
        );
        when(connectionContext.requireUserId()).thenReturn(7L);
        when(store.find(7L, "conn-1", "shop", "users", "audit-2")).thenReturn(entry);

        assertThrows(
                IllegalStateException.class,
                () -> service.restoreForCurrentUser("users", "conn-1", "shop", "audit-2")
        );
    }

    @Test
    void recordInsert_appendsSnapshot() {
        Map<String, Object> values = new LinkedHashMap<>();
        values.put("id", 9);
        values.put("name", "New");

        service.recordInsert(
                3L,
                "users",
                "conn-1",
                "shop",
                propertiesWithPrimaryKey(),
                values
        );

        ArgumentCaptor<TableDataChangeAuditEntry> captor = ArgumentCaptor.forClass(TableDataChangeAuditEntry.class);
        verify(store).append(eq(3L), eq("conn-1"), eq("shop"), eq("users"), captor.capture());
        TableDataChangeAuditEntry saved = captor.getValue();
        assertEquals(TableDataChangeAuditEntry.OP_INSERT, saved.operation());
        assertEquals(Map.of("id", 9), saved.primaryKey());
        assertEquals("New", saved.afterRow().get("name"));
    }

    @Test
    void captureBeforeRow_delegatesToLookup() {
        when(rowLookup.fetchByPrimaryKey(any(), eq("shop"), eq("users"), eq(Map.of("id", 1))))
                .thenReturn(Optional.of(Map.of("id", 1, "name", "Alice")));

        Optional<Map<String, Object>> row = service.captureBeforeRow(
                new org.apache.datawise.backend.model.ConnectionEntity(),
                "shop",
                "users",
                Map.of("id", 1)
        );

        assertEquals("Alice", row.orElseThrow().get("name"));
    }

    private static org.apache.datawise.backend.domain.TablePropertiesResult propertiesWithPrimaryKey() {
        return new org.apache.datawise.backend.domain.TablePropertiesResult(
                "users",
                null,
                null,
                null,
                null,
                null,
                List.of(new org.apache.datawise.backend.domain.TableColumnDetail(
                        1,
                        "id",
                        "INT",
                        false,
                        false,
                        "PRI",
                        null,
                        null,
                        null
                )),
                List.of(),
                List.of()
        );
    }
}
