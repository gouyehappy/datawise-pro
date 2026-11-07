package org.apache.datawise.backend.database.table;

import org.apache.datawise.backend.domain.ExecuteSqlRequest;
import org.apache.datawise.backend.domain.ExecuteSqlResult;
import org.apache.datawise.backend.domain.TableDataChangeAuditEntry;
import org.apache.datawise.backend.domain.TableDataResult;
import org.apache.datawise.backend.domain.TableRowMutateResult;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;

/**
 * 表数据门面：委托 {@link TableDataQueryService} / {@link TableDataMutationService}，Controller 无感。
 */
@Service
public class TableDataService {

    private final TableDataQueryService queryService;
    private final TableDataMutationService mutationService;
    private final TableDataChangeAuditService auditService;

    public TableDataService(
            TableDataQueryService queryService,
            TableDataMutationService mutationService,
            TableDataChangeAuditService auditService
    ) {
        this.queryService = queryService;
        this.mutationService = mutationService;
        this.auditService = auditService;
    }

    public TableDataResult fetch(String tableName, String connectionId, String database, Integer maxRows) {
        return queryService.fetch(tableName, connectionId, database, maxRows);
    }

    public TableDataResult fetch(
            String tableName,
            String connectionId,
            String database,
            Integer maxRows,
            String cursorId
    ) {
        return queryService.fetch(tableName, connectionId, database, maxRows, cursorId, null);
    }

    public TableDataResult fetch(
            String tableName,
            String connectionId,
            String database,
            Integer maxRows,
            String cursorId,
            String filter
    ) {
        return queryService.fetch(tableName, connectionId, database, maxRows, cursorId, filter);
    }

    public TableRowMutateResult insertRow(
            String tableName,
            String connectionId,
            String database,
            Map<String, Object> values
    ) {
        return mutationService.insertRow(tableName, connectionId, database, values);
    }

    public TableRowMutateResult deleteRow(
            String tableName,
            String connectionId,
            String database,
            Map<String, Object> values
    ) {
        return mutationService.deleteRow(tableName, connectionId, database, values);
    }

    public TableRowMutateResult updateRow(
            String tableName,
            String connectionId,
            String database,
            Map<String, Object> keyValues,
            Map<String, Object> values
    ) {
        return mutationService.updateRow(tableName, connectionId, database, keyValues, values);
    }

    public List<TableDataChangeAuditEntry> listAudit(
            String tableName,
            String connectionId,
            String database,
            int limit
    ) {
        return auditService.listForCurrentUser(connectionId, database, tableName, limit);
    }

    public TableRowMutateResult restoreAudit(
            String tableName,
            String connectionId,
            String database,
            String auditId
    ) {
        return auditService.restoreForCurrentUser(tableName, connectionId, database, auditId);
    }
}
