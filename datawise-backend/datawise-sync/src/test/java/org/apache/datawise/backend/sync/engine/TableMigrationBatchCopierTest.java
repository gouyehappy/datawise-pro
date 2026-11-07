package org.apache.datawise.backend.sync.engine;

import org.apache.datawise.backend.sync.api.MigrationExecutionControl;
import org.apache.datawise.backend.config.TableMigrationProperties;
import org.apache.datawise.backend.connector.facade.ConnectorFacade;
import org.apache.datawise.backend.connector.facade.dml.ConnectorDmlAccess;
import org.apache.datawise.backend.connector.facade.jdbc.ConnectorJdbcAccess;
import org.apache.datawise.backend.dml.DmlDialectRegistry;
import org.apache.datawise.backend.domain.ExecuteSqlResult;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.sql.Connection;
import java.sql.SQLException;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.same;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class TableMigrationBatchCopierTest {

    @Mock
    private ConnectorFacade connectorFacade;
    @Mock
    private ConnectorJdbcAccess jdbcAccess;
    @Mock
    private ConnectorDmlAccess dmlAccess;

    private TableMigrationProperties properties;
    private TableMigrationBatchCopier copier;

    @BeforeEach
    void setUp() throws SQLException {
        properties = new TableMigrationProperties();
        copier = new TableMigrationBatchCopier(connectorFacade, properties);
        when(connectorFacade.jdbc()).thenReturn(jdbcAccess);
        when(connectorFacade.dml()).thenReturn(dmlAccess);
        when(dmlAccess.prepareBatchInsert(anyString(), anyString(), anyString(), any()))
                .thenReturn(new DmlDialectRegistry.PreparedBatchInsert(
                        "insert into users (id) values (?)",
                        List.of("id")
                ));
        when(jdbcAccess.executeBatchInsertOnConnection(any(), anyString(), any(), any()))
                .thenReturn(new int[]{1});
    }

    @Test
    void copyAllOnConnections_withoutReadAhead_usesPrimarySourceConnection() throws SQLException {
        properties.setPipelineReadAhead(false);

        ConnectionEntity source = connectionEntity("src", "mysql");
        ConnectionEntity target = connectionEntity("tgt", "mysql");
        Connection sourceConnection = mock(Connection.class);
        Connection targetConnection = mock(Connection.class);
        ExecuteSqlResult page = pageResult(List.of(Map.of("id", 1)), false);

        when(jdbcAccess.executeSelectPageForMigrationOnConnection(
                same(sourceConnection),
                eq("mysql"),
                eq("select * from users"),
                eq(100),
                eq(0)
        )).thenReturn(page);

        TableMigrationBatchCopier.BatchCopyResult result = copier.copy(TableCopyCommand.simple(
                new MigrationEndpoints(source, target, "shop", "shop"),
                sourceConnection,
                targetConnection,
                "users",
                "select * from users",
                100,
                0
        ));

        assertEquals(1, result.rowsMigrated());
        assertEquals(1, result.batches());
        verify(jdbcAccess, never()).openPreparedConnection(any(), anyString());
        verify(jdbcAccess).executeBatchInsertOnConnection(
                same(targetConnection),
                eq("insert into users (id) values (?)"),
                eq(List.of("id")),
                any()
        );
        verify(jdbcAccess, never()).executeUpdateOnConnection(any(), anyString());
    }

    @Test
    void copyAllOnConnections_withReadAhead_usesDedicatedPrefetchConnection() throws SQLException {
        properties.setPipelineReadAhead(true);

        ConnectionEntity source = connectionEntity("src", "mysql");
        ConnectionEntity target = connectionEntity("tgt", "mysql");
        Connection sourceConnection = mock(Connection.class);
        Connection targetConnection = mock(Connection.class);
        Connection prefetchConnection = mock(Connection.class);
        ExecuteSqlResult firstPage = pageResult(List.of(Map.of("id", 1)), true);
        ExecuteSqlResult secondPage = pageResult(List.of(Map.of("id", 2)), false);

        when(jdbcAccess.openPreparedConnection(source, "shop")).thenReturn(prefetchConnection);
        when(jdbcAccess.executeSelectPageForMigrationOnConnection(
                same(prefetchConnection),
                eq("mysql"),
                eq("select * from users"),
                eq(100),
                eq(0)
        )).thenReturn(firstPage);
        when(jdbcAccess.executeSelectPageForMigrationOnConnection(
                same(prefetchConnection),
                eq("mysql"),
                eq("select * from users"),
                eq(100),
                eq(1)
        )).thenReturn(secondPage);

        TableMigrationBatchCopier.BatchCopyResult result = copier.copy(TableCopyCommand.simple(
                new MigrationEndpoints(source, target, "shop", "shop"),
                sourceConnection,
                targetConnection,
                "users",
                "select * from users",
                100,
                0
        ));

        assertEquals(2, result.rowsMigrated());
        assertEquals(2, result.batches());
        verify(jdbcAccess).openPreparedConnection(source, "shop");
        verify(jdbcAccess, never()).executeSelectPageForMigrationOnConnection(
                same(sourceConnection),
                anyString(),
                anyString(),
                anyInt(),
                anyInt()
        );
        verify(prefetchConnection).close();
    }

    @Test
    void copyAllOnConnections_resumesFromStartOffset() throws SQLException {
        properties.setPipelineReadAhead(false);

        ConnectionEntity source = connectionEntity("src", "mysql");
        ConnectionEntity target = connectionEntity("tgt", "mysql");
        Connection sourceConnection = mock(Connection.class);
        Connection targetConnection = mock(Connection.class);
        ExecuteSqlResult page = pageResult(List.of(Map.of("id", 3)), false);

        when(jdbcAccess.executeSelectPageForMigrationOnConnection(
                same(sourceConnection),
                eq("mysql"),
                eq("select * from users"),
                eq(100),
                eq(200)
        )).thenReturn(page);

        TableMigrationBatchCopier.BatchCopyResult result = copier.copy(new TableCopyCommand(
                new MigrationEndpoints(source, target, "shop", "shop"),
                sourceConnection,
                targetConnection,
                "users",
                "select * from users",
                null,
                100,
                0,
                List.of(),
                new TableMigrationBatchCopier.CopyResumeState(200, 200L, 2, List.of()),
                null,
                MigrationExecutionControl.noop(),
                List.of(),
                null,
                0
        ));

        assertEquals(201L, result.rowsMigrated());
        assertEquals(3, result.batches());
    }

    @Test
    void copyAllOnConnections_withOrderBy_usesKeysetSeekInsteadOfOffset() throws SQLException {
        properties.setPipelineReadAhead(false);

        ConnectionEntity source = connectionEntity("src", "mysql");
        ConnectionEntity target = connectionEntity("tgt", "mysql");
        Connection sourceConnection = mock(Connection.class);
        Connection targetConnection = mock(Connection.class);
        ExecuteSqlResult firstPage = pageResult(List.of(Map.of("id", 1)), true);
        ExecuteSqlResult secondPage = pageResult(List.of(Map.of("id", 2)), false);
        String baseSql = "select * from users order by id asc";

        when(jdbcAccess.executeSelectPageForMigrationOnConnection(
                same(sourceConnection),
                eq("mysql"),
                eq(baseSql),
                eq(100),
                eq(0)
        )).thenReturn(firstPage);
        when(jdbcAccess.executeSelectPageForMigrationOnConnection(
                same(sourceConnection),
                eq("mysql"),
                org.mockito.ArgumentMatchers.argThat(sql ->
                        sql != null && sql.contains("id > 1") && sql.toLowerCase().contains("order by id")),
                eq(100),
                eq(0)
        )).thenReturn(secondPage);

        TableMigrationBatchCopier.BatchCopyResult result = copier.copy(new TableCopyCommand(
                new MigrationEndpoints(source, target, "shop", "shop"),
                sourceConnection,
                targetConnection,
                "users",
                baseSql,
                null,
                100,
                0,
                List.of("id"),
                TableMigrationBatchCopier.CopyResumeState.fresh(),
                null,
                MigrationExecutionControl.noop(),
                List.of(),
                null,
                0
        ));

        assertEquals(2L, result.rowsMigrated());
        assertEquals(2, result.batches());
    }

    @Test
    void copyAllOnConnections_fullPageWithFalseHasMore_fetchesNextPage() throws SQLException {
        properties.setPipelineReadAhead(false);

        ConnectionEntity source = connectionEntity("src", "starrocks");
        ConnectionEntity target = connectionEntity("tgt", "mysql");
        Connection sourceConnection = mock(Connection.class);
        Connection targetConnection = mock(Connection.class);
        List<Map<String, Object>> batchRows = new java.util.ArrayList<>(500);
        for (int i = 0; i < 500; i++) {
            batchRows.add(Map.of("id", i));
        }
        ExecuteSqlResult firstPage = pageResult(batchRows, false);
        ExecuteSqlResult secondPage = pageResult(List.of(Map.of("id", 500)), false);

        when(jdbcAccess.executeSelectPageForMigrationOnConnection(
                same(sourceConnection),
                eq("starrocks"),
                eq("select * from users"),
                eq(500),
                eq(0)
        )).thenReturn(firstPage);
        when(jdbcAccess.executeSelectPageForMigrationOnConnection(
                same(sourceConnection),
                eq("starrocks"),
                eq("select * from users"),
                eq(500),
                eq(500)
        )).thenReturn(secondPage);

        TableMigrationBatchCopier.BatchCopyResult result = copier.copy(TableCopyCommand.simple(
                new MigrationEndpoints(source, target, "shop", "shop"),
                sourceConnection,
                targetConnection,
                "users",
                "select * from users",
                500,
                0
        ));

        assertEquals(501L, result.rowsMigrated());
        assertEquals(2, result.batches());
    }

    private static ConnectionEntity connectionEntity(String id, String dbType) {
        ConnectionEntity entity = new ConnectionEntity();
        entity.setId(id);
        entity.setDbType(dbType);
        return entity;
    }

    private static ExecuteSqlResult pageResult(List<Map<String, Object>> rows, boolean hasMore) {
        return new ExecuteSqlResult(
                "select * from users",
                rows.size(),
                1L,
                List.of(),
                rows,
                null,
                null,
                null,
                hasMore,
                0,
                rows.size()
        );
    }
}
