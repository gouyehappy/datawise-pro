package org.apache.datawise.backend.database.table;

import org.apache.datawise.backend.database.context.ConnectionExecutionContext;
import org.apache.datawise.backend.domain.TableSqlExportResult;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.apache.datawise.backend.storage.ObjectStorageException;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Service;

import java.util.List;

/** 导出表/库 DDL 与 INSERT 脚本（Navicat「导出 SQL」）。 */
@Service
public class TableSqlExportService {

    private final ConnectionExecutionContext connectionContext;
    private final TableSqlSectionBuilder sectionBuilder;
    private final TableCatalogTableLister tableLister;
    private final ObjectProvider<TableSqlExportObjectStoragePublisher> objectStoragePublisher;

    public TableSqlExportService(
            ConnectionExecutionContext connectionContext,
            TableSqlSectionBuilder sectionBuilder,
            TableCatalogTableLister tableLister,
            ObjectProvider<TableSqlExportObjectStoragePublisher> objectStoragePublisher
    ) {
        this.connectionContext = connectionContext;
        this.sectionBuilder = sectionBuilder;
        this.tableLister = tableLister;
        this.objectStoragePublisher = objectStoragePublisher;
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
        String fileName = sanitizeFileName(tableName) + ".sql";
        return finish(sql, fileName, connectionId, context.database());
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
        String fileName = sanitizeFileName(context.database()) + ".sql";
        return finish(sb.toString().trim() + "\n", fileName, connectionId, context.database());
    }

    private TableSqlExportResult finish(String sql, String fileName, String connectionId, String database) {
        TableSqlExportObjectStoragePublisher publisher = objectStoragePublisher.getIfAvailable();
        if (publisher == null) {
            return new TableSqlExportResult(sql, fileName);
        }
        try {
            TableSqlExportObjectStoragePublisher.PublishResult published =
                    publisher.publishIfEnabled(sql, fileName, connectionId, database);
            return new TableSqlExportResult(
                    sql,
                    fileName,
                    published.objectStorageKey(),
                    published.objectStorageUri()
            );
        } catch (ObjectStorageException ex) {
            throw new IllegalStateException("Failed to publish SQL export to object storage", ex);
        }
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
