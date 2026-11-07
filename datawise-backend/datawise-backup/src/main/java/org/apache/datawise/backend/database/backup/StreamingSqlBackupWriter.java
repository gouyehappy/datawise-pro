package org.apache.datawise.backend.database.backup;

import org.apache.datawise.backend.connector.facade.ConnectorFacade;
import org.apache.datawise.backend.database.table.TableDataService;
import org.apache.datawise.backend.database.table.TableDetailService;
import org.apache.datawise.backend.domain.TableDataResult;
import org.apache.datawise.backend.domain.TableDdlResult;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.io.OutputStream;
import java.io.OutputStreamWriter;
import java.io.Writer;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.function.Supplier;

/**
 * Streams SQL backup for one table or a whole database.
 * Calls {@link TableDataService#fetch} with {@code maxRows=0} directly — never via
 * {@code TableSqlExportService} / {@code QueryLimitResolver}.
 */
@Component
public class StreamingSqlBackupWriter {

    private final TableDetailService tableDetailService;
    private final TableDataService tableDataService;
    private final ConnectorFacade connectorFacade;

    public StreamingSqlBackupWriter(
            TableDetailService tableDetailService,
            TableDataService tableDataService,
            ConnectorFacade connectorFacade
    ) {
        this.tableDetailService = tableDetailService;
        this.tableDataService = tableDataService;
        this.connectorFacade = connectorFacade;
    }

    /** Legacy single-stream whole-database export (tests / fallback). */
    public void writeDatabase(
            OutputStream out,
            ConnectionEntity entity,
            String connectionId,
            String database,
            List<String> tables,
            boolean includeData,
            String connectionName,
            String appVersion,
            Supplier<Boolean> cancelCheck
    ) throws IOException {
        try (Writer writer = new OutputStreamWriter(out, StandardCharsets.UTF_8)) {
            writeHeader(writer, connectionName, database, appVersion, "streaming_sql_v1");
            String dbType = entity.getDbType();
            for (String tableName : tables) {
                if (cancelCheck.get()) {
                    throw new BackupCancelledException("cancelled during table " + tableName);
                }
                writeTableSection(writer, entity, connectionId, database, dbType, tableName, includeData, cancelCheck);
            }
            writer.flush();
        }
    }

    /**
     * Writes one table's DDL (+ optional data) to {@code out}. Returns exported row count.
     */
    public long writeTable(
            OutputStream out,
            ConnectionEntity entity,
            String connectionId,
            String database,
            String tableName,
            boolean includeData,
            String connectionName,
            String appVersion,
            Supplier<Boolean> cancelCheck
    ) throws IOException {
        try (Writer writer = new OutputStreamWriter(out, StandardCharsets.UTF_8)) {
            writeHeader(writer, connectionName, database, appVersion, "streaming_sql_v1_table");
            writer.write("-- table: " + tableName + "\n\n");
            long rows = writeTableSection(
                    writer,
                    entity,
                    connectionId,
                    database,
                    entity.getDbType(),
                    tableName,
                    includeData,
                    cancelCheck
            );
            writer.flush();
            return rows;
        }
    }

    private static void writeHeader(
            Writer writer,
            String connectionName,
            String database,
            String appVersion,
            String engine
    ) throws IOException {
        writer.write("-- DataWise " + engine + " backup\n");
        writer.write("-- connectionName: " + nullToEmpty(connectionName) + "\n");
        writer.write("-- database: " + nullToEmpty(database) + "\n");
        writer.write("-- appVersion: " + nullToEmpty(appVersion) + "\n");
        writer.write("-- timestamp: " + java.time.Instant.now() + "\n");
        writer.write("-- engine: " + engine + "\n\n");
    }

    private long writeTableSection(
            Writer writer,
            ConnectionEntity entity,
            String connectionId,
            String database,
            String dbType,
            String tableName,
            boolean includeData,
            Supplier<Boolean> cancelCheck
    ) throws IOException {
        writer.write("-- ----------------------------\n");
        writer.write("-- Table `" + tableName + "`\n");
        writer.write("-- ----------------------------\n\n");

        TableDdlResult ddl = tableDetailService.loadDdl(tableName, connectionId, database);
        writer.write(connectorFacade.dml().buildDropTableIfExists(dbType, database, tableName));
        String ddlText = ddl.ddl() != null ? ddl.ddl().trim() : "";
        if (!ddlText.isEmpty()) {
            writer.write(ddlText);
            if (!ddlText.endsWith(";")) {
                writer.write(';');
            }
            writer.write('\n');
        }

        if (!includeData) {
            writer.write('\n');
            return 0L;
        }

        long rowCount = 0L;
        String cursorId = null;
        do {
            if (cancelCheck.get()) {
                throw new BackupCancelledException("cancelled during data export for " + tableName);
            }
            TableDataResult page = cursorId == null
                    ? tableDataService.fetch(tableName, connectionId, database, 0)
                    : tableDataService.fetch(tableName, connectionId, database, 0, cursorId);
            if (page.rows() != null) {
                rowCount += page.rows().size();
            }
            String inserts = connectorFacade.dml().buildInsertsFromTableData(dbType, database, tableName, page);
            if (inserts != null && !inserts.isBlank()) {
                writer.write('\n');
                writer.write(inserts);
            }
            cursorId = Boolean.TRUE.equals(page.hasMore()) ? page.cursorId() : null;
        } while (cursorId != null && !cursorId.isBlank());

        writer.write('\n');
        return rowCount;
    }

    private static String nullToEmpty(String value) {
        return value != null ? value : "";
    }

    public static class BackupCancelledException extends RuntimeException {
        public BackupCancelledException(String message) {
            super(message);
        }
    }
}
