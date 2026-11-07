package org.apache.datawise.backend.database.table;

import org.apache.datawise.backend.database.context.ConnectionExecutionContext;
import org.apache.datawise.backend.domain.TableSqlExportResult;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.springframework.stereotype.Service;

import java.util.List;

/** 导出表/库 DDL 与 INSERT 脚本（Navicat「导出 SQL」）。 */
@Service
public class TableSqlExportService {

    private final ConnectionExecutionContext connectionContext;
    private final TableSqlSectionBuilder sectionBuilder;
    private final TableCatalogTableLister tableLister;

    public TableSqlExportService(
            ConnectionExecutionContext connectionContext,
            TableSqlSectionBuilder sectionBuilder,
            TableCatalogTableLister tableLister
    ) {
        this.connectionContext = connectionContext;
        this.sectionBuilder = sectionBuilder;
        this.tableLister = tableLister;
    }

    public TableSqlExportResult exportTable(
            String tableName,
            String connectionId,
            String database,
            boolean includeData,
            Integer maxRows
    ) {
        if (tableName == null || tableName.isBlank()) {
            throw new IllegalArgumentException("tableName is required");
        }
        ExportContext context = resolveContext(connectionId, database);
        String sql = sectionBuilder.buildTableSection(
                context.entity(),
                context.database(),
                tableName,
                connectionId,
                includeData,
                maxRows
        );
        return new TableSqlExportResult(sql, sanitizeFileName(tableName) + ".sql");
    }

    public TableSqlExportResult exportDatabase(
            String connectionId,
            String database,
            boolean includeData,
            Integer maxRows
    ) {
        ExportContext context = resolveContext(connectionId, database);
        List<String> tables = tableLister.listTables(context.entity(), context.database());
        StringBuilder sb = new StringBuilder();
        sb.append("-- Database: ").append(context.database()).append("\n\n");
        for (String tableName : tables) {
            sb.append("-- ----------------------------\n");
            sb.append("-- Table `").append(tableName).append("`\n");
            sb.append("-- ----------------------------\n\n");
            sb.append(sectionBuilder.buildTableSection(
                    context.entity(),
                    context.database(),
                    tableName,
                    connectionId,
                    includeData,
                    maxRows
            ));
            sb.append("\n");
        }
        return new TableSqlExportResult(sb.toString().trim() + "\n", sanitizeFileName(context.database()) + ".sql");
    }

    private ExportContext resolveContext(String connectionId, String database) {
        ConnectionExecutionContext.ResolvedConnectionWithDatabase resolved =
                connectionContext.requireAvailableWithDatabaseForCurrentUser(
                        connectionId,
                        database,
                        "Connection not found: " + connectionId
                );
        String resolvedDatabase = ConnectionExecutionContext.requireDatabase(resolved.entity(), database);
        return new ExportContext(resolved.entity(), resolvedDatabase);
    }

    private static String sanitizeFileName(String name) {
        String trimmed = name != null ? name.trim() : "export";
        String safe = trimmed.replaceAll("[\\\\/:*?\"<>|\\s]+", "_");
        return safe.isBlank() ? "export" : safe;
    }

    private record ExportContext(ConnectionEntity entity, String database) {
    }
}
