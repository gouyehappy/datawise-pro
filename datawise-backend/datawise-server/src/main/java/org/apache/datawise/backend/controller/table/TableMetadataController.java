package org.apache.datawise.backend.controller.table;

import org.apache.datawise.backend.common.ApiResponse;
import org.apache.datawise.backend.domain.RelationKind;
import org.apache.datawise.backend.domain.SchemaRelationsResult;
import org.apache.datawise.backend.domain.SchemaTablesResult;
import org.apache.datawise.backend.domain.TableDdlResult;
import org.apache.datawise.backend.domain.TablePropertiesResult;
import org.apache.datawise.backend.domain.TableRelationsResult;
import org.apache.datawise.backend.domain.TableSqlExportResult;
import org.apache.datawise.backend.database.table.TableDetailService;
import org.apache.datawise.backend.database.table.TableSqlExportService;
import org.apache.datawise.backend.common.support.PerfLogger;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
public class TableMetadataController {

    private static final Logger log = LoggerFactory.getLogger(TableMetadataController.class);

    private final TableDetailService tableDetailService;
    private final TableSqlExportService tableSqlExportService;

    public TableMetadataController(
            TableDetailService tableDetailService,
            TableSqlExportService tableSqlExportService
    ) {
        this.tableDetailService = tableDetailService;
        this.tableSqlExportService = tableSqlExportService;
    }

    @GetMapping("/tables/{tableName}/properties")
    public ApiResponse<TablePropertiesResult> fetchTableProperties(
            @PathVariable String tableName,
            @RequestParam(required = false) String connectionId,
            @RequestParam(required = false) String database,
            @RequestParam(defaultValue = "table") String kind
    ) {
        long startedAt = System.currentTimeMillis();
        RelationKind relationKind = RelationKind.parse(kind);
        TablePropertiesResult result = tableDetailService.loadRelationProperties(
                tableName,
                connectionId,
                database,
                relationKind
        );
        PerfLogger.log(
                log,
                "table.open.properties",
                startedAt,
                "connectionId", connectionId,
                "database", database,
                "table", tableName,
                "kind", relationKind.queryValue(),
                "columnCount", result.columns() != null ? result.columns().size() : 0
        );
        return ApiResponse.ok(result);
    }

    @GetMapping("/tables/{tableName}/relations")
    public ApiResponse<TableRelationsResult> fetchTableRelations(
            @PathVariable String tableName,
            @RequestParam(required = false) String connectionId,
            @RequestParam(required = false) String database
    ) {
        return ApiResponse.ok(tableDetailService.loadRelations(tableName, connectionId, database));
    }

    @GetMapping("/schema/relations")
    public ApiResponse<SchemaRelationsResult> fetchSchemaRelations(
            @RequestParam(required = false) String connectionId,
            @RequestParam(required = false) String database
    ) {
        return ApiResponse.ok(tableDetailService.loadSchemaRelations(connectionId, database));
    }

    @GetMapping("/schema/tables")
    public ApiResponse<SchemaTablesResult> fetchSchemaTables(
            @RequestParam(required = false) String connectionId,
            @RequestParam(required = false) String database
    ) {
        return ApiResponse.ok(tableDetailService.loadSchemaTables(connectionId, database));
    }

    @GetMapping("/tables/{tableName}/export-sql")
    public ApiResponse<TableSqlExportResult> exportTableSql(
            @PathVariable String tableName,
            @RequestParam(required = false) String connectionId,
            @RequestParam(required = false) String database,
            @RequestParam(defaultValue = "false") boolean includeData,
            @RequestParam(required = false) Integer maxRows
    ) {
        return ApiResponse.ok(tableSqlExportService.exportTable(
                tableName,
                connectionId,
                database,
                includeData,
                maxRows
        ));
    }

    @GetMapping("/export-sql/database")
    public ApiResponse<TableSqlExportResult> exportDatabaseSql(
            @RequestParam(required = false) String connectionId,
            @RequestParam(required = false) String database,
            @RequestParam(defaultValue = "false") boolean includeData,
            @RequestParam(required = false) Integer maxRows
    ) {
        return ApiResponse.ok(tableSqlExportService.exportDatabase(
                connectionId,
                database,
                includeData,
                maxRows
        ));
    }

    @GetMapping("/tables/{tableName}/ddl")
    public ApiResponse<TableDdlResult> fetchTableDdl(
            @PathVariable String tableName,
            @RequestParam(required = false) String connectionId,
            @RequestParam(required = false) String database,
            @RequestParam(defaultValue = "table") String kind
    ) {
        return ApiResponse.ok(tableDetailService.loadRelationDdl(
                tableName,
                connectionId,
                database,
                RelationKind.parse(kind)
        ));
    }
}
