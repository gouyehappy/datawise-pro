package org.apache.datawise.backend.sync.engine;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.common.support.ExceptionLogging;
import org.apache.datawise.backend.config.TableMigrationProperties;
import org.apache.datawise.backend.connector.facade.ConnectorFacade;
import org.apache.datawise.backend.database.table.TableDataSupport;
import org.apache.datawise.backend.database.table.TableDetailService;
import org.apache.datawise.backend.domain.TableMigrationBatchTableRequest;
import org.apache.datawise.backend.domain.TableMigrationRequest;
import org.apache.datawise.backend.domain.TableMigrationResult;
import org.apache.datawise.backend.domain.TablePropertiesResult;
import org.apache.datawise.backend.jdbc.error.JdbcConnectionErrors;
import org.apache.datawise.backend.migration.MigrationOrderBySupport;
import org.apache.datawise.backend.migration.TableMigrationValidationSupport;
import org.apache.datawise.backend.migration.TableMigrationValidationSupport.RowCountValidationResult;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.apache.datawise.backend.sync.api.MigrationCheckpointSink;
import org.apache.datawise.backend.sync.api.MigrationExecutionControl;
import org.apache.datawise.backend.sync.api.MigrationPausedException;
import org.apache.datawise.backend.sync.api.TableMigrationProgressListener;
import org.apache.datawise.backend.sync.support.MigrationRequestFingerprint;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.sql.Connection;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Optional;

/**
 * 表迁移批处理执行：编排 DDL、分页复制与行数校验。
 */
@Service
public class TableMigrationExecutor {

    private static final Logger log = LoggerFactory.getLogger(TableMigrationExecutor.class);

    private final ConnectorFacade connectorFacade;
    private final TableMigrationDdlPlanner ddlPlanner;
    private final TableMigrationBatchCopier batchCopier;
    private final TableMigrationRowCounter rowCounter;
    private final TableDetailService tableDetailService;
    private final TableMigrationProperties migrationProperties;

    public TableMigrationExecutor(
            ConnectorFacade connectorFacade,
            TableMigrationDdlPlanner ddlPlanner,
            TableMigrationBatchCopier batchCopier,
            TableMigrationRowCounter rowCounter,
            TableDetailService tableDetailService,
            TableMigrationProperties migrationProperties
    ) {
        this.connectorFacade = connectorFacade;
        this.ddlPlanner = ddlPlanner;
        this.batchCopier = batchCopier;
        this.rowCounter = rowCounter;
        this.tableDetailService = tableDetailService;
        this.migrationProperties = migrationProperties != null ? migrationProperties : new TableMigrationProperties();
    }

    public TableMigrationResult migrate(
            ConnectionEntity source,
            ConnectionEntity target,
            String sourceDatabase,
            String targetDatabase,
            TableMigrationRequest request
    ) {
        return migrate(new MigrationEndpoints(source, target, sourceDatabase, targetDatabase), request);
    }

    public TableMigrationResult migrate(MigrationEndpoints endpoints, TableMigrationRequest request) {
        TableMigrationPolicy policy = TableMigrationPolicy.from(request, migrationProperties.getDefaultBatchSize());
        String logicalTableName = resolveLogicalTableName(request);
        return migrateTable(
                endpoints,
                logicalTableName,
                policy,
                TableMigrationJobHooks.noop(),
                TableMigrationTableSlot.single()
        );
    }

    private static String resolveLogicalTableName(TableMigrationRequest request) {
        if (request.tableName() != null && !request.tableName().isBlank()) {
            return request.tableName().trim();
        }
        return request.targetTableName().trim();
    }

    public List<TableMigrationResult> migrateBatch(
            MigrationEndpoints endpoints,
            TableMigrationBatchPlan plan,
            TableMigrationJobHooks hooks
    ) {
        List<TableMigrationBatchTableRequest> tables = plan.tables();
        if (tables == null || tables.isEmpty()) {
            throw new IllegalArgumentException("tables is required");
        }
        TableMigrationJobHooks jobHooks = hooks != null ? hooks : TableMigrationJobHooks.noop();
        TableMigrationJobHooks batchHooks = new TableMigrationJobHooks(
                jobHooks.progressListener(),
                jobHooks.checkpointSink(),
                jobHooks.executionControl(),
                migrationProperties.isContinueOnTableFailure()
        );

        if (tables.size() == 1) {
            TableMigrationBatchTableRequest table = tables.get(0);
            String tableName = table.tableName().trim();
            TableMigrationTableSlot slot = TableMigrationTableSlot.single();
            notifyTableStart(batchHooks, slot, tableName);
            TableMigrationResult result = migrateTable(
                    endpoints,
                    tableName,
                    plan.policyFor(table),
                    batchHooks,
                    slot
            );
            notifyTableResult(batchHooks, slot, result);
            return List.of(result);
        }

        long batchStartedAt = System.currentTimeMillis();
        try {
            return connectorFacade.jdbc().withConnection(
                    endpoints.source(),
                    endpoints.sourceDatabase(),
                    sourceConnection -> connectorFacade.jdbc().withConnection(
                            endpoints.target(),
                            endpoints.targetDatabase(),
                            targetConnection -> {
                                MigrationJdbcSession[] sessionRef = {
                                        new MigrationJdbcSession(endpoints, sourceConnection, targetConnection)
                                };
                                try {
                                    List<TableMigrationResult> results = new ArrayList<>(tables.size());
                                    for (int index = 0; index < tables.size(); index++) {
                                        TableMigrationBatchTableRequest table = tables.get(index);
                                        String tableName = table.tableName().trim();
                                        TableMigrationTableSlot slot = TableMigrationTableSlot.inBatch(
                                                index + 1,
                                                tables.size(),
                                                batchStartedAt
                                        );
                                        notifyTableStart(batchHooks, slot, tableName);
                                        TableMigrationResult result = migrateTableOnConnectionsResilient(
                                                sessionRef,
                                                tableName,
                                                plan.policyFor(table),
                                                batchHooks,
                                                slot
                                        );
                                        notifyTableResult(batchHooks, slot, result);
                                        results.add(result);
                                    }
                                    return results;
                                } finally {
                                    closeReopenedSessionIfNeeded(sessionRef[0], sourceConnection, targetConnection);
                                }
                            }
                    )
            );
        } catch (MigrationPausedException ex) {
            throw ex;
        } catch (SQLException ex) {
            if (ex.getCause() instanceof InterruptedException interrupted) {
                Thread.currentThread().interrupt();
                throw new IllegalStateException("Migration interrupted", interrupted);
            }
            throw new IllegalArgumentException(
                    JdbcConnectionErrors.toUserMessage(endpoints.source(), ex),
                    ex
            );
        }
    }

    private TableMigrationResult migrateTable(
            MigrationEndpoints endpoints,
            String tableName,
            TableMigrationPolicy policy,
            TableMigrationJobHooks hooks,
            TableMigrationTableSlot slot
    ) {
        try {
            checkExecutionControl(hooks.executionControlOrNoop());
            notifyTablePhase(hooks, slot, tableName, TableMigrationProgressListener.PHASE_PREPARING);
            return connectorFacade.jdbc().withConnection(
                    endpoints.source(),
                    endpoints.sourceDatabase(),
                    sourceConnection -> connectorFacade.jdbc().withConnection(
                            endpoints.target(),
                            endpoints.targetDatabase(),
                            targetConnection -> {
                                MigrationJdbcSession[] sessionRef = {
                                        new MigrationJdbcSession(endpoints, sourceConnection, targetConnection)
                                };
                                try {
                                    return migrateTableOnConnectionsResilient(
                                            sessionRef,
                                            tableName,
                                            policy,
                                            hooks,
                                            slot
                                    );
                                } finally {
                                    closeReopenedSessionIfNeeded(sessionRef[0], sourceConnection, targetConnection);
                                }
                            }
                    )
            );
        } catch (MigrationPausedException ex) {
            throw ex;
        } catch (SQLException ex) {
            if (ex.getCause() instanceof InterruptedException interrupted) {
                Thread.currentThread().interrupt();
                throw new IllegalStateException("Migration interrupted", interrupted);
            }
            throw new IllegalArgumentException(JdbcConnectionErrors.toUserMessage(endpoints.source(), ex), ex);
        }
    }

    private TableMigrationResult migrateTableOnConnectionsResilient(
            MigrationJdbcSession[] sessionRef,
            String tableName,
            TableMigrationPolicy policy,
            TableMigrationJobHooks hooks,
            TableMigrationTableSlot slot
    ) throws SQLException {
        MigrationEndpoints endpoints = sessionRef[0].endpoints();
        String baseSelectSql;
        if (policy.usesCustomSelect()) {
            baseSelectSql = policy.sourceSelectSql().trim();
        } else {
            baseSelectSql = connectorFacade.jdbc().buildTableSelectSql(
                    endpoints.source(),
                    tableName,
                    endpoints.sourceDatabase()
            );
        }
        List<String> resolvedOrderByColumns = policy.usesCustomSelect()
                ? (policy.orderByColumns() != null ? policy.orderByColumns() : List.of())
                : resolveOrderByColumns(
                        endpoints.source(),
                        endpoints.sourceDatabase(),
                        tableName,
                        policy.orderByColumns(),
                        policy.mode(),
                        policy.watermarkColumn()
                );
        if (!policy.usesCustomSelect()) {
            requireStableOrderByIfNeeded(endpoints.source(), tableName, resolvedOrderByColumns);
        }
        String signatureSql = MigrationOrderBySupport.buildSignatureSql(
                baseSelectSql,
                policy.whereClause(),
                policy.mode(),
                policy.watermarkColumn(),
                resolvedOrderByColumns
        );
        MigrationCheckpointSink checkpointSink = hooks.checkpointSink();
        String selectSql = MigrationOrderBySupport.buildExecutionSql(
                signatureSql,
                policy.mode(),
                policy.watermarkColumn(),
                resolveLastWatermark(checkpointSink, tableName, signatureSql, policy.batchSize()),
                resolvedOrderByColumns
        );
        // FULL modes: completed tables stay skipped on resume.
        // INCR_APPEND: "completed" only means caught up through lastWatermark — always re-pull newer rows.
        if (checkpointSink != null
                && checkpointSink.isTableCompleted(tableName)
                && !"INCR_APPEND".equalsIgnoreCase(policy.mode())) {
            return resumedTableResult(tableName, checkpointSink, signatureSql, policy.batchSize(), slot.startedAtMillis());
        }

        int maxAttempts = migrationProperties.getTableRetryAttempts();
        SQLException lastFailure = null;
        for (int attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                return migrateOnConnections(
                        sessionRef[0],
                        tableName,
                        policy,
                        selectSql,
                        signatureSql,
                        resolvedOrderByColumns,
                        hooks,
                        slot
                );
            } catch (MigrationPausedException ex) {
                throw ex;
            } catch (SQLException ex) {
                lastFailure = ex;
                boolean retryable = attempt < maxAttempts && JdbcConnectionErrors.isTransientConnectionFailure(ex);
                if (!retryable) {
                    markTableFailed(checkpointSink, tableName, signatureSql, policy.batchSize());
                }
                if (retryable) {
                    ExceptionLogging.warn(
                            log,
                            "Retrying table migration after transient failure table="
                                    + tableName
                                    + " attempt="
                                    + attempt
                                    + "/"
                                    + maxAttempts,
                            ex
                    );
                    reopenSession(sessionRef);
                    continue;
                }
                if (hooks.continueOnTableFailure()) {
                    ExceptionLogging.warn(
                            log,
                            "Table migration failed and will be skipped in batch table=" + tableName,
                            ex
                    );
                    return failedTableResult(
                            endpoints.source(),
                            tableName,
                            slot.startedAtMillis(),
                            ex,
                            checkpointSink != null ? checkpointSink.partialRowsFor(tableName) : 0L
                    );
                }
                throw ex;
            }
        }
        if (lastFailure != null) {
            throw lastFailure;
        }
        throw new SQLException("Failed to migrate table " + tableName);
    }

    private void reopenSession(MigrationJdbcSession[] sessionRef) throws SQLException {
        MigrationJdbcSession previous = sessionRef[0];
        MigrationEndpoints endpoints = previous.endpoints();
        closeQuietly(previous.sourceConnection());
        closeQuietly(previous.targetConnection());
        Connection sourceConnection = connectorFacade.jdbc().openPreparedConnection(
                endpoints.source(),
                endpoints.sourceDatabase()
        );
        Connection targetConnection;
        try {
            targetConnection = connectorFacade.jdbc().openPreparedConnection(
                    endpoints.target(),
                    endpoints.targetDatabase()
            );
        } catch (SQLException ex) {
            closeQuietly(sourceConnection);
            throw ex;
        }
        sessionRef[0] = new MigrationJdbcSession(endpoints, sourceConnection, targetConnection);
    }

    private static void closeReopenedSessionIfNeeded(
            MigrationJdbcSession session,
            Connection ownedSource,
            Connection ownedTarget
    ) {
        if (session == null) {
            return;
        }
        if (session.sourceConnection() != ownedSource) {
            closeQuietly(session.sourceConnection());
        }
        if (session.targetConnection() != ownedTarget) {
            closeQuietly(session.targetConnection());
        }
    }

    private static void closeQuietly(Connection connection) {
        if (connection == null) {
            return;
        }
        try {
            connection.close();
        } catch (SQLException ex) {
            ExceptionLogging.warn(log, "Failed to close migration connection", ex);
        }
    }

    private TableMigrationResult migrateOnConnections(
            MigrationJdbcSession session,
            String tableName,
            TableMigrationPolicy policy,
            String selectSql,
            String signatureSql,
            List<String> orderByColumns,
            TableMigrationJobHooks hooks,
            TableMigrationTableSlot slot
    ) throws SQLException {
        MigrationEndpoints endpoints = session.endpoints();
        MigrationCheckpointSink checkpointSink = hooks.checkpointSink();
        String physicalTargetTable = policy.physicalTargetTable(tableName);
        MigrationExecutionControl control = hooks.executionControlOrNoop();

        checkExecutionControl(control);
        notifyTablePhase(hooks, slot, tableName, TableMigrationProgressListener.PHASE_PREPARING);

        String tableFingerprint = MigrationRequestFingerprint.computeTable(tableName, signatureSql, policy.batchSize());
        boolean freshStart = checkpointSink == null || !checkpointSink.hasTableProgress(tableName);
        if (checkpointSink != null) {
            checkpointSink.onTableRunning(tableName, tableFingerprint);
        }

        if (policy.createTargetIfMissing()) {
            checkExecutionControl(control);
            notifyTablePhase(hooks, slot, tableName, TableMigrationProgressListener.PHASE_CREATING_TARGET);
            ddlPlanner.createTargetTableIfMissing(
                    endpoints.source(),
                    endpoints.target(),
                    endpoints.sourceDatabase(),
                    endpoints.targetDatabase(),
                    physicalTargetTable
            );
        }

        checkExecutionControl(control);
        notifyTablePhase(hooks, slot, tableName, TableMigrationProgressListener.PHASE_COUNTING);
        Optional<Long> targetRowCountBefore = rowCounter.tryCountRows(
                endpoints.target(),
                endpoints.targetDatabase(),
                physicalTargetTable,
                null
        );

        if (policy.truncateTarget() && freshStart) {
            checkExecutionControl(control);
            notifyTablePhase(hooks, slot, tableName, TableMigrationProgressListener.PHASE_TRUNCATING);
            ddlPlanner.truncateTargetTable(endpoints.target(), endpoints.targetDatabase(), physicalTargetTable);
        }

        TableMigrationBatchCopier.CopyResumeState resumeState = resolveResumeState(
                checkpointSink,
                tableName,
                signatureSql,
                policy.batchSize(),
                policy.mode()
        );
        TableMigrationBatchCopier.BatchCommittedCallback callback = checkpointSink == null
                ? null
                : (offset, rowsMigrated, batches, lastWatermark, lastSeekKey) -> {
                    checkpointSink.onBatchCommitted(
                            tableName,
                            tableFingerprint,
                            offset,
                            rowsMigrated,
                            batches,
                            lastWatermark,
                            lastSeekKey
                    );
                    notifyBatchProgress(hooks, slot, tableName, offset, rowsMigrated, batches);
                };

        List<String> primaryKeyColumns = policy.usesPkUpsert()
                ? loadPrimaryKeyColumns(endpoints.source(), endpoints.sourceDatabase(), tableName)
                : List.of();
        if (policy.usesPkUpsert() && primaryKeyColumns.isEmpty()) {
            throw new IllegalArgumentException(
                    "PK_UPSERT requires a primary key on table " + tableName
            );
        }

        checkExecutionControl(control);
        notifyTablePhase(hooks, slot, tableName, TableMigrationProgressListener.PHASE_COPYING);
        TableMigrationBatchCopier.BatchCopyResult copyResult = batchCopier.copy(new TableCopyCommand(
                endpoints,
                session.sourceConnection(),
                session.targetConnection(),
                physicalTargetTable,
                selectSql,
                policy.watermarkColumn(),
                policy.batchSize(),
                policy.throttleMs(),
                orderByColumns,
                resumeState,
                callback,
                control,
                primaryKeyColumns,
                policy.resolvedConflictStrategy(),
                policy.maxRows()
        ));

        if (checkpointSink != null) {
            checkpointSink.onTableCompleted(
                    tableName,
                    tableFingerprint,
                    copyResult.rowsMigrated(),
                    copyResult.batches(),
                    resolveLastWatermark(checkpointSink, tableName, signatureSql, policy.batchSize())
            );
        }

        checkExecutionControl(control);
        notifyTablePhase(hooks, slot, tableName, TableMigrationProgressListener.PHASE_VALIDATING);
        long durationMs = System.currentTimeMillis() - slot.startedAtMillis();
        Optional<Long> sourceRowCount = rowCounter.tryCountRows(
                endpoints.source(),
                endpoints.sourceDatabase(),
                tableName,
                policy.whereClause()
        );
        Optional<Long> targetRowCountAfter = rowCounter.tryCountRows(
                endpoints.target(),
                endpoints.targetDatabase(),
                physicalTargetTable,
                null
        );
        int rowsMigrated = toIntRows(copyResult.rowsMigrated());
        RowCountValidationResult validation = TableMigrationValidationSupport.validateRowCounts(
                policy.truncateTarget() && freshStart,
                rowsMigrated,
                sourceRowCount.orElse(null),
                targetRowCountBefore.orElse(null),
                targetRowCountAfter.orElse(null)
        );
        return new TableMigrationResult(
                tableName,
                rowsMigrated,
                copyResult.batches(),
                durationMs,
                "success",
                validation.message(),
                sourceRowCount.orElse(null),
                targetRowCountBefore.orElse(null),
                targetRowCountAfter.orElse(null),
                validation.validation()
        );
    }

    private static TableMigrationBatchCopier.CopyResumeState resolveResumeState(
            MigrationCheckpointSink checkpointSink,
            String tableName,
            String selectSql,
            int batchSize,
            String mode
    ) {
        if (checkpointSink == null) {
            return TableMigrationBatchCopier.CopyResumeState.fresh();
        }
        return checkpointSink.resumePointFor(tableName, selectSql, batchSize)
                .map(point -> {
                    List<String> seekKey = MigrationOrderBySupport.decodeSeekKey(point.lastSeekKey());
                    if (!seekKey.isEmpty()) {
                        return new TableMigrationBatchCopier.CopyResumeState(
                                0,
                                point.priorRowsMigrated(),
                                point.priorBatches(),
                                seekKey
                        );
                    }
                    return new TableMigrationBatchCopier.CopyResumeState(
                            "INCR_APPEND".equalsIgnoreCase(mode) ? 0 : toBatchOffset(point.startOffset()),
                            point.priorRowsMigrated(),
                            point.priorBatches(),
                            List.of()
                    );
                })
                .orElse(TableMigrationBatchCopier.CopyResumeState.fresh());
    }

    private static void markTableFailed(
            MigrationCheckpointSink checkpointSink,
            String tableName,
            String selectSql,
            int batchSize
    ) {
        if (checkpointSink == null) {
            return;
        }
        String tableFingerprint = MigrationRequestFingerprint.computeTable(tableName, selectSql, batchSize);
        checkpointSink.onTableFailed(
                tableName,
                tableFingerprint,
                checkpointSink.partialRowsFor(tableName),
                0
        );
    }

    private static TableMigrationResult resumedTableResult(
            String tableName,
            MigrationCheckpointSink checkpointSink,
            String signatureSql,
            int batchSize,
            long startedAt
    ) {
        MigrationCheckpointSink.ResumePoint point = checkpointSink
                .resumePointFor(tableName, signatureSql, batchSize)
                .orElse(new MigrationCheckpointSink.ResumePoint(0, 0, 0, null, null));
        return new TableMigrationResult(
                tableName,
                toIntRows(point.priorRowsMigrated()),
                point.priorBatches(),
                System.currentTimeMillis() - startedAt,
                "success",
                "Resumed from checkpoint (table already completed)",
                null,
                null,
                null,
                "skipped"
        );
    }

    private static TableMigrationResult failedTableResult(
            ConnectionEntity source,
            String tableName,
            long startedAt,
            SQLException ex,
            long partialRows
    ) {
        return new TableMigrationResult(
                tableName,
                toIntRows(partialRows),
                0,
                System.currentTimeMillis() - startedAt,
                "failed",
                JdbcConnectionErrors.toUserMessage(source, ex),
                null,
                null,
                null,
                null
        );
    }

    private static void notifyTableStart(
            TableMigrationJobHooks hooks,
            TableMigrationTableSlot slot,
            String tableName
    ) {
        TableMigrationProgressListener listener = hooks != null ? hooks.progressListener() : null;
        if (listener != null) {
            listener.onTableStart(slot.tableIndex(), slot.tableTotal(), tableName);
        }
    }

    private static void notifyTableResult(
            TableMigrationJobHooks hooks,
            TableMigrationTableSlot slot,
            TableMigrationResult result
    ) {
        TableMigrationProgressListener listener = hooks != null ? hooks.progressListener() : null;
        if (listener != null) {
            listener.onTableResult(slot.tableIndex(), slot.tableTotal(), result);
        }
    }

    private static void notifyBatchProgress(
            TableMigrationJobHooks hooks,
            TableMigrationTableSlot slot,
            String tableName,
            long offset,
            long rowsMigrated,
            int batches
    ) {
        TableMigrationProgressListener listener = hooks != null ? hooks.progressListener() : null;
        if (listener != null) {
            listener.onBatchProgress(
                    slot.tableIndex(),
                    slot.tableTotal(),
                    tableName,
                    offset,
                    rowsMigrated,
                    batches
            );
        }
    }

    private static void notifyTablePhase(
            TableMigrationJobHooks hooks,
            TableMigrationTableSlot slot,
            String tableName,
            String phase
    ) {
        log.info(
                "migration.table.phase table={} index={}/{} phase={}",
                tableName,
                slot.tableIndex(),
                slot.tableTotal(),
                phase
        );
        TableMigrationProgressListener listener = hooks != null ? hooks.progressListener() : null;
        if (listener != null) {
            listener.onTablePhase(slot.tableIndex(), slot.tableTotal(), tableName, phase);
        }
    }

    private static void checkExecutionControl(MigrationExecutionControl executionControl) {
        if (executionControl != null) {
            executionControl.checkContinue();
        }
    }

    /**
     * 委托 {@link TableMigrationRequestPolicy#validate}，保留以兼容旧调用。
     */
    public static void validateRequest(TableMigrationRequest request) {
        TableMigrationRequestPolicy.validate(request);
    }

    private static int toIntRows(long rows) {
        if (rows > Integer.MAX_VALUE) {
            log.warn("rowsMigrated {} exceeds Integer.MAX_VALUE; reporting truncated count", rows);
            return Integer.MAX_VALUE;
        }
        return (int) rows;
    }

    private static int toBatchOffset(long offset) {
        if (offset < 0 || offset > Integer.MAX_VALUE) {
            throw new IllegalArgumentException("Migration batch offset exceeds supported range: " + offset);
        }
        return (int) offset;
    }

    private static void requireStableOrderByIfNeeded(
            ConnectionEntity source,
            String tableName,
            List<String> orderByColumns
    ) {
        if (orderByColumns != null && !orderByColumns.isEmpty()) {
            return;
        }
        String dbType = source.getDbType();
        if (dbType != null && DbType.olapFamilyIds().contains(dbType.toLowerCase(Locale.ROOT))) {
            throw new IllegalArgumentException(
                    "StarRocks/Doris batch migration requires stable ORDER BY columns to avoid duplicate rows. "
                            + "Set orderByColumns or ensure table " + tableName + " has a primary key."
            );
        }
    }

    private List<String> resolveOrderByColumns(
            ConnectionEntity source,
            String sourceDatabase,
            String tableName,
            List<String> requestedOrderByColumns,
            String mode,
            String watermarkColumn
    ) {
        List<String> primaryKeys = loadPrimaryKeyColumns(source, sourceDatabase, tableName);
        return MigrationOrderBySupport.resolveOrderByColumns(
                requestedOrderByColumns,
                primaryKeys,
                watermarkColumn,
                mode
        );
    }

    private List<String> loadPrimaryKeyColumns(
            ConnectionEntity source,
            String sourceDatabase,
            String tableName
    ) {
        try {
            TablePropertiesResult properties = tableDetailService.loadProperties(
                    tableName,
                    source.getId(),
                    sourceDatabase
            );
            return TableDataSupport.primaryKeyColumns(properties);
        } catch (RuntimeException ex) {
            ExceptionLogging.warn(
                    log,
                    "Failed to load primary key columns for migration table=" + tableName,
                    ex
            );
            return List.of();
        }
    }

    private static String resolveLastWatermark(
            MigrationCheckpointSink checkpointSink,
            String tableName,
            String selectSql,
            int batchSize
    ) {
        if (checkpointSink == null) {
            return null;
        }
        return checkpointSink.resumePointFor(tableName, selectSql, batchSize)
                .map(MigrationCheckpointSink.ResumePoint::lastWatermark)
                .orElse(null);
    }
}
