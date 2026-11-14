package org.apache.datawise.backend.database.backup;

import org.apache.datawise.backend.common.DeepOffsetGuard;
import org.apache.datawise.backend.connector.facade.ConnectorFacade;
import org.apache.datawise.backend.database.table.TableDetailService;
import org.apache.datawise.backend.domain.TableDataResult;
import org.apache.datawise.backend.domain.TableDdlResult;
import org.apache.datawise.backend.jdbc.stream.ResultStreamCallback;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.io.OutputStream;
import java.io.OutputStreamWriter;
import java.io.UncheckedIOException;
import java.io.Writer;
import java.nio.charset.StandardCharsets;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.function.Supplier;

/**
 * Streams SQL backup for one table or a whole database.
 * Data rows go through {@link ConnectorFacade#jdbc()} {@code streamQueryOnConnection}
 * (MetaForge A1) so peak memory stays bounded by the insert flush batch — never full-table
 * {@code List} materialization via {@code TableDataService#fetch}.
 */
@Component
public class StreamingSqlBackupWriter {

    static final int INSERT_FLUSH_ROWS = 200;

    private final TableDetailService tableDetailService;
    private final ConnectorFacade connectorFacade;

    public StreamingSqlBackupWriter(
            TableDetailService tableDetailService,
            ConnectorFacade connectorFacade
    ) {
        this.tableDetailService = tableDetailService;
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

        try {
            return DeepOffsetGuard.run(() -> streamTableData(writer, entity, database, dbType, tableName, cancelCheck));
        } catch (UncheckedIOException ex) {
            throw ex.getCause();
        } catch (BackupCancelledException ex) {
            throw ex;
        } catch (RuntimeException ex) {
            if (ex.getCause() instanceof BackupCancelledException cancelled) {
                throw cancelled;
            }
            throw ex;
        }
    }

    private long streamTableData(
            Writer writer,
            ConnectionEntity entity,
            String database,
            String dbType,
            String tableName,
            Supplier<Boolean> cancelCheck
    ) {
        String selectSql = connectorFacade.jdbc().buildTableSelectSql(entity, tableName, database);
        try {
            return connectorFacade.jdbc().withConnection(entity, database, connection -> {
                List<Map<String, Object>> columns = new ArrayList<>();
                List<Map<String, Object>> batch = new ArrayList<>(INSERT_FLUSH_ROWS);
                long[] rowCount = {0L};
                try {
                    connectorFacade.jdbc().streamQueryOnConnection(
                            connection,
                            selectSql,
                            dbType,
                            new ResultStreamCallback() {
                                @Override
                                public void onSchema(List<Map<String, Object>> schema) {
                                    columns.clear();
                                    if (schema != null) {
                                        columns.addAll(schema);
                                    }
                                }

                                @Override
                                public boolean onRow(Map<String, Object> row) throws SQLException {
                                    if (Boolean.TRUE.equals(cancelCheck.get())) {
                                        throw new BackupCancelledException(
                                                "cancelled during data export for " + tableName
                                        );
                                    }
                                    batch.add(row);
                                    rowCount[0]++;
                                    if (batch.size() >= INSERT_FLUSH_ROWS) {
                                        try {
                                            flushInsertBatch(writer, dbType, database, tableName, columns, batch);
                                        } catch (IOException ex) {
                                            throw new UncheckedIOException(ex);
                                        }
                                        batch.clear();
                                    }
                                    return true;
                                }
                            },
                            null
                    );
                    if (!batch.isEmpty()) {
                        flushInsertBatch(writer, dbType, database, tableName, columns, batch);
                    }
                    writer.write('\n');
                } catch (IOException ex) {
                    throw new UncheckedIOException(ex);
                }
                return rowCount[0];
            });
        } catch (UncheckedIOException ex) {
            throw ex;
        } catch (SQLException ex) {
            throw new IllegalStateException("Backup stream failed for table " + tableName + ": " + ex.getMessage(), ex);
        }
    }

    private void flushInsertBatch(
            Writer writer,
            String dbType,
            String database,
            String tableName,
            List<Map<String, Object>> columns,
            List<Map<String, Object>> rows
    ) throws IOException {
        if (rows.isEmpty() || columns.isEmpty()) {
            return;
        }
        TableDataResult page = new TableDataResult(
                List.copyOf(columns),
                List.copyOf(rows),
                null,
                false,
                null,
                rows.size()
        );
        String inserts = connectorFacade.dml().buildInsertsFromTableData(dbType, database, tableName, page);
        if (inserts != null && !inserts.isBlank()) {
            writer.write('\n');
            writer.write(inserts);
        }
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
