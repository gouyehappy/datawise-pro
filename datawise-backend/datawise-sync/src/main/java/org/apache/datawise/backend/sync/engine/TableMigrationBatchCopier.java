package org.apache.datawise.backend.sync.engine;

import org.apache.datawise.backend.sync.api.MigrationExecutionControl;
import org.apache.datawise.backend.config.TableMigrationProperties;
import org.apache.datawise.backend.connector.facade.ConnectorFacade;
import org.apache.datawise.backend.domain.ExecuteSqlResult;
import org.apache.datawise.backend.migration.MigrationOrderBySupport;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.apache.datawise.backend.common.support.ExceptionLogging;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.sql.Connection;
import java.sql.SQLException;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionException;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

/** 分页读取源表并批量 INSERT 到目标表。 */
@Component
public class TableMigrationBatchCopier {

    private static final Logger log = LoggerFactory.getLogger(TableMigrationBatchCopier.class);

    @FunctionalInterface
    interface BatchCommittedCallback {
        void onBatchCommitted(
                long offset,
                long rowsMigrated,
                int batches,
                String lastWatermark,
                String lastSeekKey
        ) throws SQLException;
    }

    record BatchCopyResult(long rowsMigrated, int batches) {
    }

    record CopyResumeState(int startOffset, long priorRowsMigrated, int priorBatches, List<String> seekKey) {
        static CopyResumeState fresh() {
            return new CopyResumeState(0, 0L, 0, List.of());
        }

        boolean keysetResume() {
            return seekKey != null && !seekKey.isEmpty();
        }

        boolean offsetResume() {
            return startOffset > 0 && !keysetResume();
        }
    }

    private final ConnectorFacade connectorFacade;
    private final TableMigrationProperties migrationProperties;

    public TableMigrationBatchCopier(
            ConnectorFacade connectorFacade,
            TableMigrationProperties migrationProperties
    ) {
        this.connectorFacade = connectorFacade;
        this.migrationProperties = migrationProperties != null ? migrationProperties : new TableMigrationProperties();
    }

    BatchCopyResult copy(TableCopyCommand command) throws SQLException {
        if (migrationProperties.isPipelineReadAhead()) {
            return copyWithReadAhead(command);
        }
        return copySequential(command);
    }

    BatchCopyResult copyAll(
            ConnectionEntity source,
            ConnectionEntity target,
            String sourceDatabase,
            String targetDatabase,
            String tableName,
            String selectSql,
            int batchSize,
            int throttleMs
    ) throws SQLException, InterruptedException {
        try {
            MigrationEndpoints endpoints = new MigrationEndpoints(source, target, sourceDatabase, targetDatabase);
            return connectorFacade.jdbc().withConnection(
                    source,
                    sourceDatabase,
                    sourceConnection -> connectorFacade.jdbc().withConnection(
                            target,
                            targetDatabase,
                            targetConnection -> copy(TableCopyCommand.simple(
                                    endpoints,
                                    sourceConnection,
                                    targetConnection,
                                    tableName,
                                    selectSql,
                                    batchSize,
                                    throttleMs
                            ))
                    )
            );
        } catch (SQLException ex) {
            if (ex.getCause() instanceof InterruptedException interrupted) {
                Thread.currentThread().interrupt();
                throw interrupted;
            }
            throw ex;
        }
    }

    private BatchCopyResult copySequential(TableCopyCommand command) throws SQLException {
        MigrationEndpoints endpoints = command.endpoints();
        long rowsMigrated = command.resumeState().priorRowsMigrated();
        int batches = command.resumeState().priorBatches();
        int offset = command.resumeState().startOffset();
        boolean keysetMode = useKeysetMode(command);
        warnIfOffsetWithoutOrderBy(command, keysetMode);
        List<String> seekKey = keysetMode ? command.resumeState().seekKey() : List.of();
        checkExecutionControl(command.executionControl());
        while (true) {
            ExecuteSqlResult page = fetchPage(
                    command.sourceConnection(),
                    endpoints.source(),
                    command.selectSql(),
                    command.batchSize(),
                    keysetMode ? 0 : offset,
                    command.orderByColumns(),
                    seekKey
            );
            List<Map<String, Object>> rows = page.rows();
            if (rows == null || rows.isEmpty()) {
                break;
            }

            rows = trimToMaxRows(rows, rowsMigrated, command.maxRows());
            if (rows.isEmpty()) {
                break;
            }

            checkExecutionControl(command.executionControl());
            insertPage(
                    endpoints.target(),
                    command.targetConnection(),
                    endpoints.targetDatabase(),
                    command.tableName(),
                    page,
                    rows,
                    command.primaryKeyColumns(),
                    command.conflictStrategy()
            );
            rowsMigrated += rows.size();
            batches += 1;
            if (keysetMode) {
                seekKey = MigrationOrderBySupport.extractSeekKey(
                        rows,
                        command.orderByColumns(),
                        page.columns()
                );
            } else {
                offset += rows.size();
            }
            notifyBatchCommitted(
                    command.callback(),
                    rowsMigrated,
                    rowsMigrated,
                    batches,
                    resolveBatchWatermark(rows, command.watermarkColumn()),
                    keysetMode ? MigrationOrderBySupport.encodeSeekKey(seekKey) : null
            );
            checkExecutionControl(command.executionControl());

            if (command.maxRows() > 0 && rowsMigrated >= command.maxRows()) {
                break;
            }
            if (!shouldFetchAnotherPage(page, command.batchSize())) {
                break;
            }
            sleepThrottle(command.throttleMs(), command.executionControl());
        }
        return new BatchCopyResult(rowsMigrated, batches);
    }

    private BatchCopyResult copyWithReadAhead(TableCopyCommand command) throws SQLException {
        MigrationEndpoints endpoints = command.endpoints();
        Connection prefetchConnection = connectorFacade.jdbc().openPreparedConnection(
                endpoints.source(),
                endpoints.sourceDatabase()
        );
        ExecutorService prefetchExecutor = Executors.newSingleThreadExecutor(
                runnable -> {
                    Thread thread = new Thread(runnable, "migration-prefetch");
                    thread.setDaemon(true);
                    return thread;
                }
        );
        CompletableFuture<ExecuteSqlResult> nextPageFuture = null;
        try {
            long rowsMigrated = command.resumeState().priorRowsMigrated();
            int batches = command.resumeState().priorBatches();
            int offset = command.resumeState().startOffset();
            boolean keysetMode = useKeysetMode(command);
            warnIfOffsetWithoutOrderBy(command, keysetMode);
            List<String> seekKey = keysetMode ? command.resumeState().seekKey() : List.of();
            checkExecutionControl(command.executionControl());
            nextPageFuture = supplyPageFetch(
                    prefetchConnection,
                    endpoints.source(),
                    command.selectSql(),
                    command.batchSize(),
                    keysetMode ? 0 : offset,
                    command.orderByColumns(),
                    seekKey,
                    prefetchExecutor
            );

            while (true) {
                ExecuteSqlResult page = awaitPage(nextPageFuture, command.executionControl());
                List<Map<String, Object>> rows = page.rows();
                if (rows == null || rows.isEmpty()) {
                    break;
                }

                rows = trimToMaxRows(rows, rowsMigrated, command.maxRows());
                if (rows.isEmpty()) {
                    break;
                }

                List<String> nextSeekKey = keysetMode
                        ? MigrationOrderBySupport.extractSeekKey(
                                rows,
                                command.orderByColumns(),
                                page.columns()
                        )
                        : List.of();
                int nextOffset = keysetMode ? 0 : offset + rows.size();
                boolean capped = command.maxRows() > 0 && rowsMigrated + rows.size() >= command.maxRows();
                if (!capped && shouldFetchAnotherPage(page, command.batchSize())) {
                    nextPageFuture = supplyPageFetch(
                            prefetchConnection,
                            endpoints.source(),
                            command.selectSql(),
                            command.batchSize(),
                            nextOffset,
                            command.orderByColumns(),
                            keysetMode ? nextSeekKey : List.of(),
                            prefetchExecutor
                    );
                } else {
                    nextPageFuture = null;
                }

                checkExecutionControl(command.executionControl());
                insertPage(
                        endpoints.target(),
                        command.targetConnection(),
                        endpoints.targetDatabase(),
                        command.tableName(),
                        page,
                        rows,
                        command.primaryKeyColumns(),
                        command.conflictStrategy()
                );
                rowsMigrated += rows.size();
                batches += 1;
                if (keysetMode) {
                    seekKey = nextSeekKey;
                } else {
                    offset += rows.size();
                }
                notifyBatchCommitted(
                        command.callback(),
                        rowsMigrated,
                        rowsMigrated,
                        batches,
                        resolveBatchWatermark(rows, command.watermarkColumn()),
                        keysetMode ? MigrationOrderBySupport.encodeSeekKey(seekKey) : null
                );
                checkExecutionControl(command.executionControl());

                if (capped || !shouldFetchAnotherPage(page, command.batchSize())) {
                    break;
                }
                sleepThrottle(command.throttleMs(), command.executionControl());
            }
            return new BatchCopyResult(rowsMigrated, batches);
        } finally {
            if (nextPageFuture != null && !nextPageFuture.isDone()) {
                nextPageFuture.cancel(true);
            }
            prefetchExecutor.shutdown();
            try {
                if (!prefetchExecutor.awaitTermination(30, TimeUnit.SECONDS)) {
                    prefetchExecutor.shutdownNow();
                    prefetchExecutor.awaitTermination(5, TimeUnit.SECONDS);
                }
            } catch (InterruptedException ex) {
                Thread.currentThread().interrupt();
                prefetchExecutor.shutdownNow();
            }
            closeQuietly(prefetchConnection);
        }
    }

    private static void checkExecutionControl(MigrationExecutionControl executionControl) {
        if (executionControl != null) {
            executionControl.checkContinue();
        }
    }

    private static List<Map<String, Object>> trimToMaxRows(
            List<Map<String, Object>> rows,
            long rowsMigrated,
            int maxRows
    ) {
        if (maxRows <= 0 || rows == null || rows.isEmpty()) {
            return rows;
        }
        long remaining = maxRows - rowsMigrated;
        if (remaining <= 0) {
            return List.of();
        }
        if (rows.size() <= remaining) {
            return rows;
        }
        return rows.subList(0, (int) remaining);
    }

    private static void sleepThrottle(int throttleMs, MigrationExecutionControl executionControl) throws SQLException {
        if (throttleMs <= 0) {
            checkExecutionControl(executionControl);
            return;
        }
        long deadline = System.currentTimeMillis() + throttleMs;
        while (true) {
            checkExecutionControl(executionControl);
            long remaining = deadline - System.currentTimeMillis();
            if (remaining <= 0) {
                return;
            }
            try {
                Thread.sleep(Math.min(100L, remaining));
            } catch (InterruptedException ex) {
                Thread.currentThread().interrupt();
                throw new SQLException("Migration interrupted", ex);
            }
        }
    }

    private static void notifyBatchCommitted(
            BatchCommittedCallback callback,
            long offset,
            long rowsMigrated,
            int batches,
            String lastWatermark,
            String lastSeekKey
    ) throws SQLException {
        if (callback != null) {
            callback.onBatchCommitted(offset, rowsMigrated, batches, lastWatermark, lastSeekKey);
        }
    }

    private static boolean useKeysetMode(TableCopyCommand command) {
        List<String> orderByColumns = command.orderByColumns();
        if (orderByColumns == null || orderByColumns.isEmpty()) {
            return false;
        }
        return !command.resumeState().offsetResume();
    }

    private static void warnIfOffsetWithoutOrderBy(TableCopyCommand command, boolean keysetMode) {
        if (keysetMode) {
            return;
        }
        log.warn(
                "Migration table {} uses OFFSET pagination without a keyset ORDER BY; "
                        + "concurrent source writes may skip or duplicate rows. Prefer stable order-by columns.",
                command.tableName()
        );
    }

    /**
     * Full pages always schedule another fetch. Some JDBC drivers report {@code hasMore=false}
     * after exactly {@code batchSize} rows when fetch size equals batch size; the next page then
     * returns empty and the loop exits cleanly.
     */
    static boolean shouldFetchAnotherPage(ExecuteSqlResult page, int batchSize) {
        if (page == null) {
            return false;
        }
        List<Map<String, Object>> rows = page.rows();
        int rowCount = rows != null ? rows.size() : 0;
        if (rowCount <= 0) {
            return false;
        }
        if (rowCount >= batchSize) {
            return true;
        }
        return Boolean.TRUE.equals(page.hasMore());
    }

    private static String resolveBatchWatermark(List<Map<String, Object>> rows, String watermarkColumn) {
        if (watermarkColumn == null || watermarkColumn.isBlank() || rows == null || rows.isEmpty()) {
            return null;
        }
        Object value = rows.get(rows.size() - 1).get(watermarkColumn);
        return value != null ? String.valueOf(value) : null;
    }

    private ExecuteSqlResult fetchPage(
            Connection connection,
            ConnectionEntity source,
            String selectSql,
            int batchSize,
            int offset,
            List<String> orderByColumns,
            List<String> seekKey
    ) throws SQLException {
        String pageSql = selectSql;
        if (orderByColumns != null && !orderByColumns.isEmpty() && seekKey != null && !seekKey.isEmpty()) {
            pageSql = MigrationOrderBySupport.appendKeysetSeek(selectSql, orderByColumns, seekKey);
        }
        return connectorFacade.jdbc().executeSelectPageForMigrationOnConnection(
                connection,
                source.getDbType(),
                pageSql,
                batchSize,
                offset
        );
    }

    private CompletableFuture<ExecuteSqlResult> supplyPageFetch(
            Connection prefetchConnection,
            ConnectionEntity source,
            String selectSql,
            int batchSize,
            int offset,
            List<String> orderByColumns,
            List<String> seekKey,
            ExecutorService prefetchExecutor
    ) {
        return CompletableFuture.supplyAsync(
                () -> {
                    try {
                        return fetchPage(
                                prefetchConnection,
                                source,
                                selectSql,
                                batchSize,
                                offset,
                                orderByColumns,
                                seekKey
                        );
                    } catch (SQLException ex) {
                        throw new CompletionException(ex);
                    }
                },
                prefetchExecutor
        );
    }

    private static ExecuteSqlResult awaitPage(
            CompletableFuture<ExecuteSqlResult> nextPageFuture,
            MigrationExecutionControl executionControl
    ) throws SQLException {
        while (true) {
            checkExecutionControl(executionControl);
            try {
                return nextPageFuture.get(200, TimeUnit.MILLISECONDS);
            } catch (TimeoutException ex) {
                // Keep polling so pause/cancel can stop a long source read promptly.
            } catch (InterruptedException ex) {
                Thread.currentThread().interrupt();
                nextPageFuture.cancel(true);
                throw new SQLException("Migration interrupted", ex);
            } catch (ExecutionException ex) {
                Throwable cause = ex.getCause();
                if (cause instanceof SQLException sqlEx) {
                    throw sqlEx;
                }
                if (cause instanceof RuntimeException runtimeEx) {
                    throw runtimeEx;
                }
                throw new SQLException("Failed to prefetch migration page", cause);
            } catch (CompletionException ex) {
                Throwable cause = ex.getCause();
                if (cause instanceof SQLException sqlEx) {
                    throw sqlEx;
                }
                if (cause instanceof RuntimeException runtimeEx) {
                    throw runtimeEx;
                }
                throw new SQLException("Failed to prefetch migration page", cause);
            }
        }
    }

    private void insertPage(
            ConnectionEntity target,
            Connection targetConnection,
            String targetDatabase,
            String tableName,
            ExecuteSqlResult page,
            List<Map<String, Object>> rows,
            List<String> primaryKeyColumns,
            String conflictStrategy
    ) throws SQLException {
        if (conflictStrategy != null && !conflictStrategy.isBlank()) {
            var preparedUpsert = connectorFacade.dml().prepareBatchUpsert(
                    target.getDbType(),
                    targetDatabase,
                    tableName,
                    page.columns(),
                    primaryKeyColumns != null ? primaryKeyColumns : List.of(),
                    conflictStrategy
            );
            if (preparedUpsert != null
                    && preparedUpsert.sql() != null
                    && !preparedUpsert.sql().isBlank()) {
                connectorFacade.jdbc().executeBatchInsertOnConnection(
                        targetConnection,
                        preparedUpsert.sql(),
                        preparedUpsert.columnKeys(),
                        rows
                );
                return;
            }
            String writeSql = connectorFacade.dml().buildMultiUpsert(
                    target.getDbType(),
                    targetDatabase,
                    tableName,
                    page.columns(),
                    rows,
                    primaryKeyColumns != null ? primaryKeyColumns : List.of(),
                    conflictStrategy
            );
            if (!writeSql.isBlank()) {
                connectorFacade.jdbc().executeUpdateOnConnection(targetConnection, writeSql);
            }
            return;
        }

        var prepared = connectorFacade.dml().prepareBatchInsert(
                target.getDbType(),
                targetDatabase,
                tableName,
                page.columns()
        );
        if (prepared != null && prepared.sql() != null && !prepared.sql().isBlank()) {
            connectorFacade.jdbc().executeBatchInsertOnConnection(
                    targetConnection,
                    prepared.sql(),
                    prepared.columnKeys(),
                    rows
            );
            return;
        }

        String writeSql = connectorFacade.dml().buildMultiInsert(
                target.getDbType(),
                targetDatabase,
                tableName,
                page.columns(),
                rows
        );
        if (!writeSql.isBlank()) {
            connectorFacade.jdbc().executeUpdateOnConnection(targetConnection, writeSql);
        }
    }

    private static void closeQuietly(Connection connection) {
        if (connection == null) {
            return;
        }
        try {
            connection.close();
        } catch (SQLException ex) {
            ExceptionLogging.warn(log, "Failed to close migration prefetch connection", ex);
        }
    }
}
