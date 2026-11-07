package org.apache.datawise.backend.controller.table;

import org.apache.datawise.backend.common.ApiResponse;
import org.apache.datawise.backend.domain.TableDataChangeAuditEntry;
import org.apache.datawise.backend.domain.TableDataResult;
import org.apache.datawise.backend.domain.TableRowMutateRequest;
import org.apache.datawise.backend.domain.TableRowMutateResult;
import org.apache.datawise.backend.domain.TableRowUpdateRequest;
import org.apache.datawise.backend.database.table.TableDataService;
import org.apache.datawise.backend.common.support.ApiRequestLogger;
import org.apache.datawise.backend.common.support.PerfLogger;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/tables")
public class TableDataController {

    private static final Logger log = LoggerFactory.getLogger(TableDataController.class);

    private final TableDataService tableDataService;

    public TableDataController(TableDataService tableDataService) {
        this.tableDataService = tableDataService;
    }

    @GetMapping("/{tableName}/data")
    public ApiResponse<TableDataResult> fetchTableData(
            @PathVariable String tableName,
            @RequestParam(required = false) String connectionId,
            @RequestParam(required = false) String database,
            @RequestParam(required = false) Integer maxRows,
            @RequestParam(required = false) String cursorId,
            @RequestParam(required = false) String filter
    ) {
        long startedAt = System.currentTimeMillis();
        TableDataResult result = tableDataService.fetch(
                tableName,
                connectionId,
                database,
                maxRows,
                cursorId,
                filter
        );
        PerfLogger.log(
                log,
                "table.open.data",
                startedAt,
                "connectionId", connectionId,
                "database", database,
                "table", tableName,
                "rowCount", result.rows() != null ? result.rows().size() : 0
        );
        return ApiResponse.ok(result);
    }

    @PostMapping("/{tableName}/rows")
    public ApiResponse<TableRowMutateResult> insertTableRow(
            @PathVariable String tableName,
            @RequestBody TableRowMutateRequest request
    ) {
        ApiRequestLogger.logEntry(
                log,
                "POST /api/tables/{}/rows",
                "connectionId", request.connectionId(),
                "database", request.database()
        );
        try {
            TableRowMutateResult result = tableDataService.insertRow(
                    tableName,
                    request.connectionId(),
                    request.database(),
                    request.values()
            );
            ApiRequestLogger.logSuccess(log, "POST /api/tables/{}/rows", "affectedRows", result.affectedRows());
            return ApiResponse.ok(result);
        } catch (RuntimeException ex) {
            ApiRequestLogger.logFailure(
                    log,
                    "POST /api/tables/{}/rows",
                    ex,
                    "connectionId", request.connectionId(),
                    "database", request.database()
            );
            throw ex;
        }
    }

    @PostMapping("/{tableName}/rows/delete")
    public ApiResponse<TableRowMutateResult> deleteTableRow(
            @PathVariable String tableName,
            @RequestBody TableRowMutateRequest request
    ) {
        ApiRequestLogger.logEntry(
                log,
                "POST /api/tables/{}/rows/delete",
                "connectionId", request.connectionId(),
                "database", request.database()
        );
        try {
            TableRowMutateResult result = tableDataService.deleteRow(
                    tableName,
                    request.connectionId(),
                    request.database(),
                    request.values()
            );
            ApiRequestLogger.logSuccess(
                    log,
                    "POST /api/tables/{}/rows/delete",
                    "affectedRows",
                    result.affectedRows()
            );
            return ApiResponse.ok(result);
        } catch (RuntimeException ex) {
            ApiRequestLogger.logFailure(
                    log,
                    "POST /api/tables/{}/rows/delete",
                    ex,
                    "connectionId", request.connectionId(),
                    "database", request.database()
            );
            throw ex;
        }
    }

    @PostMapping("/{tableName}/rows/update")
    public ApiResponse<TableRowMutateResult> updateTableRow(
            @PathVariable String tableName,
            @RequestBody TableRowUpdateRequest request
    ) {
        ApiRequestLogger.logEntry(
                log,
                "POST /api/tables/{}/rows/update",
                "connectionId", request.connectionId(),
                "database", request.database()
        );
        try {
            TableRowMutateResult result = tableDataService.updateRow(
                    tableName,
                    request.connectionId(),
                    request.database(),
                    request.keyValues(),
                    request.values()
            );
            ApiRequestLogger.logSuccess(
                    log,
                    "POST /api/tables/{}/rows/update",
                    "affectedRows",
                    result.affectedRows()
            );
            return ApiResponse.ok(result);
        } catch (RuntimeException ex) {
            ApiRequestLogger.logFailure(
                    log,
                    "POST /api/tables/{}/rows/update",
                    ex,
                    "connectionId", request.connectionId(),
                    "database", request.database()
            );
            throw ex;
        }
    }

    @GetMapping("/{tableName}/data/audit")
    public ApiResponse<List<TableDataChangeAuditEntry>> listTableDataAudit(
            @PathVariable String tableName,
            @RequestParam(required = false) String connectionId,
            @RequestParam(required = false) String database,
            @RequestParam(required = false, defaultValue = "50") int limit
    ) {
        return ApiResponse.ok(tableDataService.listAudit(tableName, connectionId, database, limit));
    }

    @PostMapping("/{tableName}/data/audit/{auditId}/restore")
    public ApiResponse<TableRowMutateResult> restoreTableDataAudit(
            @PathVariable String tableName,
            @PathVariable String auditId,
            @RequestBody TableRowMutateRequest request
    ) {
        ApiRequestLogger.logEntry(
                log,
                "POST /api/tables/{}/data/audit/{}/restore",
                "connectionId", request.connectionId(),
                "database", request.database(),
                "auditId", auditId
        );
        try {
            TableRowMutateResult result = tableDataService.restoreAudit(
                    tableName,
                    request.connectionId(),
                    request.database(),
                    auditId
            );
            ApiRequestLogger.logSuccess(
                    log,
                    "POST /api/tables/{}/data/audit/{}/restore",
                    "affectedRows",
                    result.affectedRows()
            );
            return ApiResponse.ok(result);
        } catch (RuntimeException ex) {
            ApiRequestLogger.logFailure(
                    log,
                    "POST /api/tables/{}/data/audit/{}/restore",
                    ex,
                    "connectionId", request.connectionId(),
                    "database", request.database(),
                    "auditId", auditId
            );
            throw ex;
        }
    }
}
