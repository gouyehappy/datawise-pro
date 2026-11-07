package org.apache.datawise.backend.database.table;

import org.apache.datawise.backend.database.context.ConnectionExecutionContext;
import org.apache.datawise.backend.service.ConnectionAccessService;

import org.apache.datawise.backend.common.TableDataException;
import org.apache.datawise.backend.connector.facade.ConnectorFacade;
import org.apache.datawise.backend.connector.support.ConnectorCapabilityGuard;
import org.apache.datawise.backend.domain.TablePropertiesResult;
import org.apache.datawise.backend.domain.TableRowMutateResult;
import org.apache.datawise.backend.database.table.TableDataSupport;
import org.apache.datawise.backend.database.table.TableDataSupport.ConnectionContext;
import org.springframework.stereotype.Service;

import java.sql.SQLException;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** 表数据行级 DML：INSERT / UPDATE / DELETE。 */
@Service
public class TableDataMutationService {

    private static final ThreadLocal<Boolean> AUDIT_SUPPRESSED = ThreadLocal.withInitial(() -> false);

    private final ConnectionExecutionContext connectionContext;
    private final ConnectorFacade connectorFacade;
    private final TableDetailService tableDetailService;
    private final ConnectionAccessService connectionAccessService;
    private final TableDataChangeAuditService auditService;

    public TableDataMutationService(
            ConnectionExecutionContext connectionContext,
            ConnectorFacade connectorFacade,
            TableDetailService tableDetailService,
            ConnectionAccessService connectionAccessService,
            TableDataChangeAuditService auditService
    ) {
        this.connectionContext = connectionContext;
        this.connectorFacade = connectorFacade;
        this.tableDetailService = tableDetailService;
        this.connectionAccessService = connectionAccessService;
        this.auditService = auditService;
    }

    /** Skips audit capture for inverse DML during time-travel restore. */
    public static <T> T runWithoutAudit(java.util.function.Supplier<T> action) {
        AUDIT_SUPPRESSED.set(true);
        try {
            return action.get();
        } finally {
            AUDIT_SUPPRESSED.remove();
        }
    }

    private static boolean shouldRecordAudit() {
        return !Boolean.TRUE.equals(AUDIT_SUPPRESSED.get());
    }

    public TableRowMutateResult insertRow(
            String tableName,
            String connectionId,
            String database,
            Map<String, Object> values
    ) {
        connectionAccessService.requireDmlAccess(connectionContext.requireUserId(), connectionId);
        ConnectionContext context = TableDataSupport.resolveContext(
                connectionContext,
                tableName,
                connectionId,
                database
        );
        ConnectorCapabilityGuard.requireDml(connectorFacade, context.entity());
        TablePropertiesResult properties = tableDetailService.loadProperties(
                tableName,
                connectionId,
                context.database()
        );
        Map<String, Object> insertValues = TableDataSupport.normalizeInsertValues(properties, values);
        if (insertValues.isEmpty()) {
            throw new IllegalArgumentException("Insert requires at least one column value");
        }
        String sql = connectorFacade.dml().buildInsert(
                context.entity().getDbType(),
                context.database(),
                tableName,
                insertValues
        );
        TableRowMutateResult result = executeUpdate(context, sql);
        if (result.affectedRows() > 0 && shouldRecordAudit()) {
            auditService.recordInsert(
                    connectionContext.requireUserId(),
                    tableName,
                    connectionId,
                    context.database(),
                    properties,
                    insertValues
            );
        }
        return result;
    }

    public TableRowMutateResult deleteRow(
            String tableName,
            String connectionId,
            String database,
            Map<String, Object> values
    ) {
        connectionAccessService.requireDmlAccess(connectionContext.requireUserId(), connectionId);
        ConnectionContext context = TableDataSupport.resolveContext(
                connectionContext,
                tableName,
                connectionId,
                database
        );
        ConnectorCapabilityGuard.requireDml(connectorFacade, context.entity());
        TablePropertiesResult properties = tableDetailService.loadProperties(
                tableName,
                connectionId,
                context.database()
        );
        List<String> primaryKeys = TableDataSupport.primaryKeyColumns(properties);
        if (primaryKeys.isEmpty()) {
            throw new IllegalArgumentException("Table has no primary key; delete is not supported");
        }
        Map<String, Object> filtered = connectorFacade.dml().filterKnownColumns(
                values,
                TableDataSupport.columnNames(properties)
        );
        Map<String, Object> pkValues = requirePrimaryKeyValues(primaryKeys, filtered);
        var beforeRow = auditService.captureBeforeRow(
                context.entity(),
                context.database(),
                tableName,
                pkValues
        );
        String sql = connectorFacade.dml().buildDeleteByPrimaryKey(
                context.entity().getDbType(),
                context.database(),
                tableName,
                pkValues
        );
        TableRowMutateResult result = executeUpdate(context, sql);
        if (result.affectedRows() > 0 && beforeRow.isPresent() && shouldRecordAudit()) {
            auditService.recordDelete(
                    connectionContext.requireUserId(),
                    tableName,
                    connectionId,
                    context.database(),
                    pkValues,
                    beforeRow.get()
            );
        }
        return result;
    }

    public TableRowMutateResult updateRow(
            String tableName,
            String connectionId,
            String database,
            Map<String, Object> keyValues,
            Map<String, Object> values
    ) {
        connectionAccessService.requireDmlAccess(connectionContext.requireUserId(), connectionId);
        ConnectionContext context = TableDataSupport.resolveContext(
                connectionContext,
                tableName,
                connectionId,
                database
        );
        ConnectorCapabilityGuard.requireDml(connectorFacade, context.entity());
        TablePropertiesResult properties = tableDetailService.loadProperties(
                tableName,
                connectionId,
                context.database()
        );
        List<String> primaryKeys = TableDataSupport.primaryKeyColumns(properties);
        if (primaryKeys.isEmpty()) {
            throw new IllegalArgumentException("Table has no primary key; update is not supported");
        }
        List<String> allowed = TableDataSupport.columnNames(properties);
        Map<String, Object> filteredKeys = connectorFacade.dml().filterKnownColumns(keyValues, allowed);
        Map<String, Object> filteredValues = connectorFacade.dml().filterKnownColumns(values, allowed);
        if (filteredValues.isEmpty()) {
            throw new IllegalArgumentException("Update requires at least one column value");
        }
        Map<String, Object> pkValues = requirePrimaryKeyValues(primaryKeys, filteredKeys);
        var beforeRow = auditService.captureBeforeRow(
                context.entity(),
                context.database(),
                tableName,
                pkValues
        );
        String sql = connectorFacade.dml().buildUpdate(
                context.entity().getDbType(),
                context.database(),
                tableName,
                filteredValues,
                pkValues
        );
        TableRowMutateResult result = executeUpdate(context, sql);
        if (result.affectedRows() > 0 && beforeRow.isPresent() && shouldRecordAudit()) {
            auditService.recordUpdate(
                    connectionContext.requireUserId(),
                    tableName,
                    connectionId,
                    context.database(),
                    pkValues,
                    beforeRow.get(),
                    filteredValues
            );
        }
        return result;
    }

    private TableRowMutateResult executeUpdate(ConnectionContext context, String sql) {
        try {
            return connectorFacade.jdbc().executeUpdate(context.entity(), sql, context.database());
        } catch (SQLException ex) {
            throw TableDataSupport.toTableDataException(
                    context.entity(),
                    ex,
                    TableDataException.MUTATION_FAILED
            );
        }
    }

    private static Map<String, Object> requirePrimaryKeyValues(
            List<String> primaryKeys,
            Map<String, Object> filtered
    ) {
        Map<String, Object> pkValues = new LinkedHashMap<>();
        for (String pk : primaryKeys) {
            if (!filtered.containsKey(pk)) {
                throw new IllegalArgumentException("Missing primary key value: " + pk);
            }
            pkValues.put(pk, filtered.get(pk));
        }
        return pkValues;
    }
}
