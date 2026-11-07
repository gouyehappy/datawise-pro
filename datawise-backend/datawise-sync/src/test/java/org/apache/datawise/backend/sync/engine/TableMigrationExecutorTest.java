package org.apache.datawise.backend.sync.engine;

import org.apache.datawise.backend.sync.api.MigrationCheckpointSink;
import org.apache.datawise.backend.sync.api.MigrationExecutionControl;
import org.apache.datawise.backend.sync.api.TableMigrationProgressListener;
import org.apache.datawise.backend.config.TableMigrationProperties;
import org.apache.datawise.backend.connector.facade.ConnectorFacade;
import org.apache.datawise.backend.connector.facade.dml.ConnectorDmlAccess;
import org.apache.datawise.backend.connector.facade.jdbc.ConnectorJdbcAccess;
import org.apache.datawise.backend.domain.TableColumnDetail;
import org.apache.datawise.backend.domain.TableMigrationBatchTableRequest;
import org.apache.datawise.backend.domain.TableMigrationRequest;
import org.apache.datawise.backend.domain.TableMigrationResult;
import org.apache.datawise.backend.domain.TablePropertiesResult;
import org.apache.datawise.backend.domain.TableRowMutateResult;
import org.apache.datawise.backend.database.table.TableDetailService;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.apache.datawise.backend.jdbc.support.JdbcConnectionCallback;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.quality.Strictness;
import org.mockito.junit.jupiter.MockitoSettings;

import java.sql.Connection;
import java.sql.SQLException;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class TableMigrationExecutorTest {

    @Mock
    private ConnectorFacade connectorFacade;
    @Mock
    private ConnectorJdbcAccess jdbcAccess;
    @Mock
    private ConnectorDmlAccess dmlAccess;
    @Mock
    private TableMigrationDdlPlanner ddlPlanner;
    @Mock
    private TableMigrationBatchCopier batchCopier;
    @Mock
    private TableDetailService tableDetailService;

    private TableMigrationExecutor executor;

    @BeforeEach
    void setUp() {
        TableMigrationProperties properties = new TableMigrationProperties();
        executor = new TableMigrationExecutor(
                connectorFacade,
                ddlPlanner,
                batchCopier,
                new TableMigrationRowCounter(connectorFacade),
                tableDetailService,
                properties
        );
        when(tableDetailService.loadProperties(anyString(), anyString(), anyString()))
                .thenReturn(tablePropertiesWithoutPk());
    }

    @Test
    void validateRequest_rejectsMissingTableName() {
        TableMigrationRequest request = new TableMigrationRequest(
                "src",
                null,
                "tgt",
                null,
                "  ",
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null
        );

        IllegalArgumentException ex = assertThrows(
                IllegalArgumentException.class,
                () -> TableMigrationRequestPolicy.validate(request)
        );
        assertEquals("tableName or sourceSelectSql is required", ex.getMessage());
    }

    @Test
    void validateRequest_requiresTargetTableWhenSourceSelectSql() {
        TableMigrationRequest request = new TableMigrationRequest(
                "src",
                null,
                "tgt",
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                null,
                "SELECT id FROM orders",
                null,
                null,
                null
        );

        IllegalArgumentException ex = assertThrows(
                IllegalArgumentException.class,
                () -> TableMigrationRequestPolicy.validate(request)
        );
        assertEquals("targetTableName is required when sourceSelectSql is set", ex.getMessage());
    }

    @Test
    void migrate_rejectsBatchSizeBelowMinimum() {
        ConnectionEntity source = connectionEntity("src", "mysql");
        ConnectionEntity target = connectionEntity("tgt", "mysql");
        TableMigrationRequest request = migrationRequest(10, 0);

        IllegalArgumentException ex = assertThrows(
                IllegalArgumentException.class,
                () -> executor.migrate(source, target, "shop", "shop", request)
        );
        assertEquals("batchSize must be between 50 and 5000", ex.getMessage());
    }

    @Test
    void migrate_rejectsThrottleAboveMaximum() {
        ConnectionEntity source = connectionEntity("src", "mysql");
        ConnectionEntity target = connectionEntity("tgt", "mysql");
        TableMigrationRequest request = migrationRequest(500, 6000);

        IllegalArgumentException ex = assertThrows(
                IllegalArgumentException.class,
                () -> executor.migrate(source, target, "shop", "shop", request)
        );
        assertEquals("throttleMs must be between 0 and 5000", ex.getMessage());
    }

    @Test
    void migrate_batchesRowsAndInvokesDdlWhenRequested() throws SQLException {
        when(connectorFacade.jdbc()).thenReturn(jdbcAccess);

        ConnectionEntity source = connectionEntity("src", "mysql");
        ConnectionEntity target = connectionEntity("tgt", "postgresql");
        TableMigrationRequest request = new TableMigrationRequest(
                "src",
                "shop",
                "tgt",
                "warehouse",
                "users",
                null,
                null,
                null,
                "status = 'active'",
                500,
                0,
                true,
                true,
                null,
                null,
                null,
                null
        );

        stubPrimaryKeyLookup("users", "id");
        stubDualConnections(source, target, "shop", "warehouse");
        when(jdbcAccess.buildTableSelectSql(source, "users", "shop"))
                .thenReturn("select * from users");
        when(jdbcAccess.countTableRows(eq(source), eq("users"), eq("shop"), eq("status = 'active'")))
                .thenReturn(2L);
        when(jdbcAccess.countTableRows(eq(target), eq("users"), eq("warehouse"), isNull()))
                .thenReturn(0L, 2L);
        when(batchCopier.copy(argThat((TableCopyCommand cmd) ->
                "shop".equals(cmd.endpoints().sourceDatabase())
                        && "warehouse".equals(cmd.endpoints().targetDatabase())
                        && "users".equals(cmd.tableName())
                        && cmd.selectSql().contains("status = 'active'")
        ))).thenReturn(new TableMigrationBatchCopier.BatchCopyResult(2, 1));

        TableMigrationResult result = executor.migrate(source, target, "shop", "warehouse", request);

        assertEquals("users", result.tableName());
        assertEquals(2, result.rowsMigrated());
        assertEquals(1, result.batches());
        assertEquals("success", result.status());
        verify(ddlPlanner).createTargetTableIfMissing(source, target, "shop", "warehouse", "users");
        verify(ddlPlanner).truncateTargetTable(target, "warehouse", "users");
        verify(jdbcAccess, times(1)).withConnection(eq(source), eq("shop"), any());
        verify(jdbcAccess, times(1)).withConnection(eq(target), eq("warehouse"), any());
    }

    @Test
    void migrateBatch_reusesConnectionsAcrossTables() throws SQLException {
        when(connectorFacade.jdbc()).thenReturn(jdbcAccess);

        ConnectionEntity source = connectionEntity("src", "mysql");
        ConnectionEntity target = connectionEntity("tgt", "mysql");
        stubDualConnections(source, target, "shop", "shop");

        when(jdbcAccess.buildTableSelectSql(source, "users", "shop")).thenReturn("select * from users");
        when(jdbcAccess.buildTableSelectSql(source, "orders", "shop")).thenReturn("select * from orders");
        when(jdbcAccess.countTableRows(any(), anyString(), eq("shop"), isNull())).thenReturn(1L);
        when(batchCopier.copy(any(TableCopyCommand.class)))
                .thenReturn(new TableMigrationBatchCopier.BatchCopyResult(1, 1));

        List<TableMigrationResult> results = migrateBatch(
                source,
                target,
                "shop",
                List.of(
                        new TableMigrationBatchTableRequest("users", false),
                        new TableMigrationBatchTableRequest("orders", false)
                ),
                TableMigrationJobHooks.noop()
        );

        assertEquals(2, results.size());
        verify(jdbcAccess, times(1)).withConnection(eq(source), eq("shop"), any());
        verify(jdbcAccess, times(1)).withConnection(eq(target), eq("shop"), any());
        verify(batchCopier, times(2)).copy(any(TableCopyCommand.class));
    }

    @Test
    void migrateBatch_continuesWhenOneTableFails() throws SQLException {
        TableMigrationProperties properties = new TableMigrationProperties();
        properties.setContinueOnTableFailure(true);
        executor = new TableMigrationExecutor(
                connectorFacade,
                ddlPlanner,
                batchCopier,
                new TableMigrationRowCounter(connectorFacade),
                tableDetailService,
                properties
        );
        when(connectorFacade.jdbc()).thenReturn(jdbcAccess);

        ConnectionEntity source = connectionEntity("src", "mysql");
        ConnectionEntity target = connectionEntity("tgt", "mysql");
        stubDualConnections(source, target, "shop", "shop");

        when(jdbcAccess.buildTableSelectSql(source, "users", "shop")).thenReturn("select * from users");
        when(jdbcAccess.buildTableSelectSql(source, "orders", "shop")).thenReturn("select * from orders");
        when(jdbcAccess.countTableRows(any(), eq("users"), eq("shop"), isNull())).thenReturn(1L);
        when(jdbcAccess.countTableRows(any(), eq("orders"), eq("shop"), isNull())).thenReturn(1L);
        when(batchCopier.copy(any(TableCopyCommand.class))).thenAnswer(invocation -> {
            TableCopyCommand cmd = invocation.getArgument(0);
            if ("orders".equals(cmd.tableName())) {
                throw new SQLException("orders copy failed");
            }
            return new TableMigrationBatchCopier.BatchCopyResult(1, 1);
        });

        List<TableMigrationResult> results = migrateBatch(
                source,
                target,
                "shop",
                List.of(
                        new TableMigrationBatchTableRequest("users", false),
                        new TableMigrationBatchTableRequest("orders", false)
                ),
                TableMigrationJobHooks.noop()
        );

        assertEquals(2, results.size());
        assertEquals("success", results.get(0).status());
        assertEquals("failed", results.get(1).status());
        assertEquals("users", results.get(0).tableName());
        assertEquals("orders", results.get(1).tableName());
    }

    @Test
    void migrateBatch_notifiesProgressListener() throws SQLException {
        when(connectorFacade.jdbc()).thenReturn(jdbcAccess);

        ConnectionEntity source = connectionEntity("src", "mysql");
        ConnectionEntity target = connectionEntity("tgt", "mysql");
        stubDualConnections(source, target, "shop", "shop");

        when(jdbcAccess.buildTableSelectSql(source, "users", "shop")).thenReturn("select * from users");
        when(jdbcAccess.buildTableSelectSql(source, "orders", "shop")).thenReturn("select * from orders");
        when(jdbcAccess.countTableRows(any(), anyString(), eq("shop"), isNull())).thenReturn(1L);
        when(batchCopier.copy(any(TableCopyCommand.class)))
                .thenReturn(new TableMigrationBatchCopier.BatchCopyResult(1, 1));

        TableMigrationProgressListener listener = mock(TableMigrationProgressListener.class);

        migrateBatch(
                source,
                target,
                "shop",
                List.of(
                        new TableMigrationBatchTableRequest("users", false),
                        new TableMigrationBatchTableRequest("orders", false)
                ),
                new TableMigrationJobHooks(listener, null, MigrationExecutionControl.noop(), false)
        );

        verify(listener).onTableStart(1, 2, "users");
        verify(listener).onTableResult(eq(1), eq(2), argThat(result -> "users".equals(result.tableName())));
        verify(listener).onTableStart(2, 2, "orders");
        verify(listener).onTableResult(eq(2), eq(2), argThat(result -> "orders".equals(result.tableName())));
    }

    @Test
    void migrate_retriesTransientCopyFailure() throws SQLException {
        when(connectorFacade.jdbc()).thenReturn(jdbcAccess);

        ConnectionEntity source = connectionEntity("src", "mysql");
        ConnectionEntity target = connectionEntity("tgt", "mysql");
        TableMigrationRequest request = migrationRequest(500, 0);

        stubDualConnections(source, target, "shop", "shop");
        when(jdbcAccess.buildTableSelectSql(source, "users", "shop")).thenReturn("select * from users");
        when(jdbcAccess.countTableRows(any(), any(), any(), any())).thenReturn(1L);
        when(batchCopier.copy(any(TableCopyCommand.class)))
                .thenThrow(new SQLException("connection reset by peer"))
                .thenReturn(new TableMigrationBatchCopier.BatchCopyResult(1, 1));

        TableMigrationResult result = executor.migrate(source, target, "shop", "shop", request);

        assertEquals("success", result.status());
        verify(batchCopier, times(2)).copy(any(TableCopyCommand.class));
    }

    @Test
    void migrate_skipsInsertWhenMultiInsertSqlBlank() throws SQLException {
        when(connectorFacade.jdbc()).thenReturn(jdbcAccess);

        ConnectionEntity source = connectionEntity("src", "mysql");
        ConnectionEntity target = connectionEntity("tgt", "mysql");
        TableMigrationRequest request = migrationRequest(500, 0);

        stubDualConnections(source, target, "shop", "shop");
        when(jdbcAccess.buildTableSelectSql(source, "users", "shop")).thenReturn("select * from users");
        when(jdbcAccess.countTableRows(any(), any(), any(), any())).thenReturn(1L);
        when(batchCopier.copy(any(TableCopyCommand.class)))
                .thenReturn(new TableMigrationBatchCopier.BatchCopyResult(1, 1));

        TableMigrationResult result = executor.migrate(source, target, "shop", "shop", request);

        assertEquals(1, result.rowsMigrated());
        verify(jdbcAccess, never()).executeUpdateOnConnection(any(), anyString());
        verify(jdbcAccess, never()).executeUpdate(any(), anyString(), anyString());
    }

    @Test
    void migrate_incrAppend_buildsWatermarkFilterSqlAndUsesStableCheckpointSignature() throws SQLException {
        when(connectorFacade.jdbc()).thenReturn(jdbcAccess);

        ConnectionEntity source = connectionEntity("src", "mysql");
        ConnectionEntity target = connectionEntity("tgt", "mysql");

        stubDualConnections(source, target, "shop", "shop");
        when(jdbcAccess.buildTableSelectSql(source, "users", "shop")).thenReturn("select * from users");
        when(jdbcAccess.countTableRows(any(), any(), any(), any())).thenReturn(1L);

        MigrationCheckpointSink checkpointSink = mock(MigrationCheckpointSink.class);
        when(checkpointSink.isTableCompleted("users")).thenReturn(false);
        when(checkpointSink.hasTableProgress("users")).thenReturn(true);
        when(checkpointSink.resumePointFor(eq("users"), anyString(), eq(500)))
                .thenAnswer(invocation -> {
                    String signatureSql = invocation.getArgument(1, String.class);
                    assertTrue(signatureSql.contains("/*INCR_APPEND watermark=updated_at"));
                    assertTrue(!signatureSql.contains("2026-01-01"));
                    return Optional.of(new MigrationCheckpointSink.ResumePoint(0, 0, 0, "2026-01-01 00:00:00", null));
                });

        when(batchCopier.copy(argThat((TableCopyCommand cmd) ->
                cmd.selectSql().contains("updated_at > '2026-01-01 00:00:00'")
                        && cmd.selectSql().contains("ORDER BY updated_at")
        ))).thenReturn(new TableMigrationBatchCopier.BatchCopyResult(1, 1));

        List<TableMigrationResult> results = migrateIncrAppendBatch(
                source,
                target,
                "shop",
                List.of(new TableMigrationBatchTableRequest("users", false)),
                checkpointSink
        );
        assertEquals(1, results.size());
        assertEquals("success", results.get(0).status());
        verify(checkpointSink).onTableRunning(eq("users"), anyString());
    }

    @Test
    void migrate_incrAppend_secondRunUsesSavedWatermark() throws SQLException {
        when(connectorFacade.jdbc()).thenReturn(jdbcAccess);

        ConnectionEntity source = connectionEntity("src", "mysql");
        ConnectionEntity target = connectionEntity("tgt", "mysql");

        stubDualConnections(source, target, "shop", "shop");
        when(jdbcAccess.buildTableSelectSql(source, "users", "shop")).thenReturn("select * from users");
        when(jdbcAccess.countTableRows(any(), any(), any(), any())).thenReturn(1L);

        AtomicReference<String> savedWatermark = new AtomicReference<>(null);
        MigrationCheckpointSink checkpointSink = mock(MigrationCheckpointSink.class);
        when(checkpointSink.isTableCompleted("users")).thenReturn(false);
        when(checkpointSink.hasTableProgress("users")).thenReturn(true);
        when(checkpointSink.resumePointFor(eq("users"), anyString(), eq(500)))
                .thenAnswer(invocation -> {
                    String signatureSql = invocation.getArgument(1, String.class);
                    assertTrue(signatureSql.contains("/*INCR_APPEND watermark=updated_at"));
                    return Optional.of(new MigrationCheckpointSink.ResumePoint(0, 0, 0, savedWatermark.get(), null));
                });

        when(batchCopier.copy(any(TableCopyCommand.class))).thenAnswer(invocation -> {
            TableCopyCommand cmd = invocation.getArgument(0);
            if (cmd.selectSql().contains("updated_at > '2026-01-02")) {
                return new TableMigrationBatchCopier.BatchCopyResult(1, 1);
            }
            if (cmd.callback() != null) {
                cmd.callback().onBatchCommitted(1, 1, 1, "2026-01-02 00:00:00", null);
            }
            savedWatermark.set("2026-01-02 00:00:00");
            return new TableMigrationBatchCopier.BatchCopyResult(1, 1);
        });

        migrateIncrAppendBatch(
                source,
                target,
                "shop",
                List.of(new TableMigrationBatchTableRequest("users", false)),
                checkpointSink
        );
        migrateIncrAppendBatch(
                source,
                target,
                "shop",
                List.of(new TableMigrationBatchTableRequest("users", false)),
                checkpointSink
        );

        assertEquals("2026-01-02 00:00:00", savedWatermark.get());
        verify(checkpointSink, atLeastOnce()).onBatchCommitted(
                eq("users"), anyString(), anyLong(), anyLong(), anyInt(), eq("2026-01-02 00:00:00"), isNull()
        );
    }

    private List<TableMigrationResult> migrateBatch(
            ConnectionEntity source,
            ConnectionEntity target,
            String database,
            List<TableMigrationBatchTableRequest> tables,
            TableMigrationJobHooks hooks
    ) throws SQLException {
        TableMigrationBatchPlan plan = new TableMigrationBatchPlan(
                tables,
                new TableMigrationPolicy("FULL_APPEND", null, null, null, 500, 0, false, false, null, null, null, 0)
        );
        return executor.migrateBatch(
                new MigrationEndpoints(source, target, database, database),
                plan,
                hooks
        );
    }

    private static TableMigrationJobHooks incrAppendHooks(MigrationCheckpointSink checkpointSink) {
        return new TableMigrationJobHooks(
                null,
                checkpointSink,
                MigrationExecutionControl.noop(),
                false
        );
    }

    private static TableMigrationBatchPlan incrAppendPlan(List<TableMigrationBatchTableRequest> tables) {
        return new TableMigrationBatchPlan(
                tables,
                new TableMigrationPolicy("INCR_APPEND", "updated_at", null, null, 500, 0, false, false, null, null, null, 0)
        );
    }

    private List<TableMigrationResult> migrateIncrAppendBatch(
            ConnectionEntity source,
            ConnectionEntity target,
            String database,
            List<TableMigrationBatchTableRequest> tables,
            MigrationCheckpointSink checkpointSink
    ) throws SQLException {
        return executor.migrateBatch(
                new MigrationEndpoints(source, target, database, database),
                incrAppendPlan(tables),
                incrAppendHooks(checkpointSink)
        );
    }

    private static TableMigrationRequest migrationRequest(int batchSize, int throttleMs) {
        return new TableMigrationRequest(
                "src",
                "shop",
                "tgt",
                "shop",
                "users",
                null,
                null,
                null,
                null,
                batchSize,
                throttleMs,
                false,
                false,
                null,
                null,
                null,
                null
        );
    }

    private static TablePropertiesResult tablePropertiesWithoutPk() {
        return new TablePropertiesResult("t", null, null, null, null, null, List.of(), List.of(), List.of());
    }

    private void stubPrimaryKeyLookup(String tableName, String... pkColumns) {
        List<TableColumnDetail> columns = new java.util.ArrayList<>();
        int index = 1;
        for (String pk : pkColumns) {
            columns.add(new TableColumnDetail(index++, pk, "varchar", false, false, "PRI", null, null, null));
        }
        when(tableDetailService.loadProperties(eq(tableName), anyString(), anyString()))
                .thenReturn(new TablePropertiesResult(tableName, null, null, null, null, null, columns, List.of(), List.of()));
    }

    private static ConnectionEntity connectionEntity(String id, String dbType) {
        ConnectionEntity entity = new ConnectionEntity();
        entity.setId(id);
        entity.setDbType(dbType);
        entity.setHost("127.0.0.1");
        entity.setPort("3306");
        return entity;
    }

    private void stubDualConnections(
            ConnectionEntity source,
            ConnectionEntity target,
            String sourceDatabase,
            String targetDatabase
    ) throws SQLException {
        Connection sourceConnection = mock(Connection.class);
        Connection targetConnection = mock(Connection.class);
        when(jdbcAccess.withConnection(eq(target), eq(targetDatabase), any())).thenAnswer(invocation -> {
            JdbcConnectionCallback<?> callback = invocation.getArgument(2);
            return callback.apply(targetConnection);
        });
        when(jdbcAccess.withConnection(eq(source), eq(sourceDatabase), any())).thenAnswer(invocation -> {
            JdbcConnectionCallback<?> callback = invocation.getArgument(2);
            return callback.apply(sourceConnection);
        });
    }
}
