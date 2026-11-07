package org.apache.datawise.backend.database.table;

import org.apache.datawise.backend.configstore.TableDataChangeAuditStore;
import org.apache.datawise.backend.domain.TableDataChangeAuditEntry;
import org.apache.datawise.backend.domain.TablePropertiesResult;
import org.apache.datawise.backend.domain.TableRowMutateResult;
import org.apache.datawise.backend.database.context.ConnectionExecutionContext;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;

/** Captures row-level DML snapshots and restores prior state (time-travel). */
@Service
public class TableDataChangeAuditService {

    private final TableDataChangeAuditStore store;
    private final TableDataRowLookup rowLookup;
    private final TableDataMutationService mutationService;
    private final ConnectionExecutionContext connectionContext;

    public TableDataChangeAuditService(
            TableDataChangeAuditStore store,
            TableDataRowLookup rowLookup,
            @Lazy TableDataMutationService mutationService,
            ConnectionExecutionContext connectionContext
    ) {
        this.store = store;
        this.rowLookup = rowLookup;
        this.mutationService = mutationService;
        this.connectionContext = connectionContext;
    }

    public List<TableDataChangeAuditEntry> listForCurrentUser(
            String connectionId,
            String database,
            String tableName,
            int limit
    ) {
        return list(connectionContext.requireUserId(), connectionId, database, tableName, limit);
    }

    public TableRowMutateResult restoreForCurrentUser(
            String tableName,
            String connectionId,
            String database,
            String auditId
    ) {
        return restore(connectionContext.requireUserId(), tableName, connectionId, database, auditId);
    }

    public List<TableDataChangeAuditEntry> list(
            long userId,
            String connectionId,
            String database,
            String tableName,
            int limit
    ) {
        return store.list(userId, connectionId, database, tableName, limit);
    }

    public TableRowMutateResult restore(
            long userId,
            String tableName,
            String connectionId,
            String database,
            String auditId
    ) {
        TableDataChangeAuditEntry entry = store.find(userId, connectionId, database, tableName, auditId);
        if (entry.reverted()) {
            throw new IllegalStateException("Audit entry already restored: " + auditId);
        }
        TableRowMutateResult result = TableDataMutationService.runWithoutAudit(() -> switch (entry.operation()) {
            case TableDataChangeAuditEntry.OP_INSERT ->
                    mutationService.deleteRow(tableName, connectionId, database, requirePrimaryKey(entry));
            case TableDataChangeAuditEntry.OP_DELETE ->
                    mutationService.insertRow(tableName, connectionId, database, copyMap(entry.beforeRow()));
            case TableDataChangeAuditEntry.OP_UPDATE ->
                    mutationService.updateRow(
                            tableName,
                            connectionId,
                            database,
                            copyMap(entry.primaryKey()),
                            buildUpdateRestoreValues(entry)
                    );
            default -> throw new IllegalArgumentException("Cannot restore operation: " + entry.operation());
        });
        store.markReverted(userId, connectionId, database, tableName, auditId);
        store.append(
                userId,
                connectionId,
                database,
                tableName,
                newEntry(
                        TableDataChangeAuditEntry.OP_RESTORE,
                        null,
                        null,
                        copyMap(entry.primaryKey()),
                        auditId
                )
        );
        return result;
    }

    void recordInsert(
            long userId,
            String tableName,
            String connectionId,
            String database,
            TablePropertiesResult properties,
            Map<String, Object> insertValues
    ) {
        Map<String, Object> afterRow = copyMap(insertValues);
        store.append(
                userId,
                connectionId,
                database,
                tableName,
                newEntry(
                        TableDataChangeAuditEntry.OP_INSERT,
                        null,
                        afterRow,
                        extractPrimaryKey(properties, afterRow),
                        null
                )
        );
    }

    Optional<Map<String, Object>> captureBeforeRow(
            ConnectionEntity entity,
            String database,
            String tableName,
            Map<String, Object> primaryKey
    ) {
        if (primaryKey == null || primaryKey.isEmpty()) {
            return Optional.empty();
        }
        return rowLookup.fetchByPrimaryKey(entity, database, tableName, primaryKey);
    }

    void recordUpdate(
            long userId,
            String tableName,
            String connectionId,
            String database,
            Map<String, Object> primaryKey,
            Map<String, Object> beforeRow,
            Map<String, Object> updatedValues
    ) {
        Map<String, Object> afterRow = mergeRow(beforeRow, updatedValues);
        store.append(
                userId,
                connectionId,
                database,
                tableName,
                newEntry(
                        TableDataChangeAuditEntry.OP_UPDATE,
                        copyMap(beforeRow),
                        afterRow,
                        copyMap(primaryKey),
                        null
                )
        );
    }

    void recordDelete(
            long userId,
            String tableName,
            String connectionId,
            String database,
            Map<String, Object> primaryKey,
            Map<String, Object> beforeRow
    ) {
        store.append(
                userId,
                connectionId,
                database,
                tableName,
                newEntry(
                        TableDataChangeAuditEntry.OP_DELETE,
                        copyMap(beforeRow),
                        null,
                        copyMap(primaryKey),
                        null
                )
        );
    }

    private static TableDataChangeAuditEntry newEntry(
            String operation,
            Map<String, Object> beforeRow,
            Map<String, Object> afterRow,
            Map<String, Object> primaryKey,
            String restoredFromId
    ) {
        return new TableDataChangeAuditEntry(
                "audit-" + System.currentTimeMillis() + "-" + UUID.randomUUID().toString().substring(0, 8),
                System.currentTimeMillis(),
                operation,
                beforeRow,
                afterRow,
                primaryKey,
                false,
                restoredFromId
        );
    }

    private static Map<String, Object> buildUpdateRestoreValues(TableDataChangeAuditEntry entry) {
        Map<String, Object> beforeRow = entry.beforeRow() == null ? Map.of() : entry.beforeRow();
        Map<String, Object> afterRow = entry.afterRow() == null ? Map.of() : entry.afterRow();
        Map<String, Object> restoreValues = new LinkedHashMap<>();
        for (Map.Entry<String, Object> column : afterRow.entrySet()) {
            Object beforeValue = beforeRow.get(column.getKey());
            if (!Objects.equals(beforeValue, column.getValue())) {
                restoreValues.put(column.getKey(), beforeValue);
            }
        }
        if (restoreValues.isEmpty()) {
            throw new IllegalStateException("No column changes to restore for audit entry: " + entry.id());
        }
        return restoreValues;
    }

    private static Map<String, Object> requirePrimaryKey(TableDataChangeAuditEntry entry) {
        if (entry.primaryKey() == null || entry.primaryKey().isEmpty()) {
            throw new IllegalStateException("Audit entry has no primary key; cannot undo insert: " + entry.id());
        }
        return copyMap(entry.primaryKey());
    }

    private static Map<String, Object> extractPrimaryKey(
            TablePropertiesResult properties,
            Map<String, Object> row
    ) {
        List<String> primaryKeys = TableDataSupport.primaryKeyColumns(properties);
        Map<String, Object> pkValues = new LinkedHashMap<>();
        for (String column : primaryKeys) {
            if (row.containsKey(column)) {
                pkValues.put(column, row.get(column));
            }
        }
        return pkValues;
    }

    private static Map<String, Object> mergeRow(Map<String, Object> beforeRow, Map<String, Object> updatedValues) {
        Map<String, Object> merged = new LinkedHashMap<>(beforeRow == null ? Map.of() : beforeRow);
        merged.putAll(updatedValues);
        return merged;
    }

    private static Map<String, Object> copyMap(Map<String, Object> source) {
        if (source == null || source.isEmpty()) {
            return Map.of();
        }
        return Map.copyOf(source);
    }
}
