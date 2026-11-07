package org.apache.datawise.backend.database.sql;

import org.apache.datawise.backend.database.context.ConnectionExecutionContext;

import org.apache.datawise.backend.config.DatawiseQueryProperties;
import org.apache.datawise.backend.connector.facade.ConnectorFacade;
import org.apache.datawise.backend.connector.facade.jdbc.ConnectorJdbcAccess;
import org.apache.datawise.backend.connector.facade.jdbc.ConnectorJdbcSessionAccess;
import org.apache.datawise.backend.domain.ExecuteSqlResult;
import org.apache.datawise.backend.jdbc.session.JdbcManualSessionStore.ManagedSession;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.apache.datawise.backend.common.SqlDeepOffsetException;
import org.apache.datawise.backend.common.SqlExecutionException;
import org.apache.datawise.backend.service.outbound.OutboundEventSignals;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.sql.SQLException;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class SqlCursorServiceTest {

    @Mock
    private ConnectionExecutionContext connectionContext;
    @Mock
    private ConnectorFacade connectorFacade;
    @Mock
    private ConnectorJdbcAccess jdbcAccess;
    @Mock
    private ConnectorJdbcSessionAccess jdbcSessionAccess;
    @Mock
    private ManagedSession managedSession;
    @Mock
    private SqlResultCursorStore cursorStore;
    @Mock
    private OutboundEventSignals outboundEventSignals;

    private SqlCursorService service;

    @BeforeEach
    void setUp() {
        DatawiseQueryProperties properties = unlimitedQueryProperties();
        service = new SqlCursorService(
                connectionContext,
                connectorFacade,
                new QueryLimitResolver(properties),
                cursorStore,
                outboundEventSignals,
                properties
        );
    }

    @Test
    void resolvePageSize_usesClientLimitWhenServerUnlimited() {
        assertEquals(200, service.resolvePageSize(200));
    }

    @Test
    void resolvePageSize_fallsBackToDefaultWhenMissing() {
        assertEquals(SqlCursorService.DEFAULT_PAGE_SIZE, service.resolvePageSize(null));
        assertEquals(SqlCursorService.DEFAULT_PAGE_SIZE, service.resolvePageSize(0));
    }

    @Test
    void executePagedFirstPage_returnsPageWithoutCursorWhenNoMoreRows() throws SQLException {
        when(connectorFacade.jdbc()).thenReturn(jdbcAccess);
        ConnectionEntity entity = connectionEntity("conn-1");
        List<Map<String, Object>> rows = List.of(Map.of("id", 1));
        ExecuteSqlResult pageResult = new ExecuteSqlResult(
                "select * from t",
                1,
                5,
                List.of(Map.of("name", "id")),
                rows,
                null,
                null,
                null,
                false,
                0,
                500
        );
        when(jdbcAccess.executeSelectPage(entity, "select * from t", "shop", 500, 0)).thenReturn(pageResult);

        ExecuteSqlResult page = service.executePagedFirstPage(1L, entity, "shop", "select * from t", 500);

        assertEquals(1, page.rowCount());
        assertFalse(Boolean.TRUE.equals(page.hasMore()));
        assertNull(page.cursorId());
        verify(jdbcAccess).executeSelectPage(entity, "select * from t", "shop", 500, 0);
    }

    @Test
    void executePagedFirstPage_registersCancelKeyWhenSessionProvided() throws SQLException {
        when(connectorFacade.jdbc()).thenReturn(jdbcAccess);
        ConnectionEntity entity = connectionEntity("conn-1");
        List<Map<String, Object>> rows = List.of(Map.of("id", 1));
        ExecuteSqlResult pageResult = new ExecuteSqlResult(
                "select * from t",
                1,
                5,
                List.of(Map.of("name", "id")),
                rows,
                null,
                null,
                null,
                false,
                0,
                500
        );
        when(jdbcAccess.executeSelectPage(entity, "select * from t", "shop", 500, 0, "1:console-1"))
                .thenReturn(pageResult);

        ExecuteSqlResult page = service.executePagedFirstPage(
                1L,
                entity,
                "shop",
                "select * from t",
                500,
                "console-1"
        );

        assertEquals(1, page.rowCount());
        verify(jdbcAccess).executeSelectPage(entity, "select * from t", "shop", 500, 0, "1:console-1");
    }

    @Test
    void executePagedFirstPage_createsCursorWhenMoreRowsExist() throws SQLException {
        when(connectorFacade.jdbc()).thenReturn(jdbcAccess);
        ConnectionEntity entity = connectionEntity("conn-1");
        List<Map<String, Object>> columns = List.of(Map.of("name", "id"));
        List<Map<String, Object>> rows = List.of(Map.of("id", 1));
        ExecuteSqlResult pageResult = new ExecuteSqlResult(
                "select * from t",
                1,
                5,
                columns,
                rows,
                null,
                null,
                null,
                true,
                0,
                1
        );
        when(jdbcAccess.executeSelectPage(entity, "select * from t", "shop", 1, 0)).thenReturn(pageResult);
        when(cursorStore.create(eq(1L), eq("conn-1"), eq("shop"), eq("select * from t"), eq(null), eq(1), eq(1), eq(columns)))
                .thenReturn("cursor-abc");

        ExecuteSqlResult page = service.executePagedFirstPage(1L, entity, "shop", "select * from t", 1);

        assertEquals("cursor-abc", page.cursorId());
        assertEquals(1, page.rowCount());
        verify(cursorStore).create(1L, "conn-1", "shop", "select * from t", null, 1, 1, columns);
    }

    @Test
    void executePagedFirstPage_publishesSqlExecutionFailedOnSqlException() throws SQLException {
        when(connectorFacade.jdbc()).thenReturn(jdbcAccess);
        ConnectionEntity entity = connectionEntity("conn-1");
        entity.setName("demo");
        when(jdbcAccess.executeSelectPage(entity, "select bad", "shop", 500, 0))
                .thenThrow(new SQLException("syntax error near category"));

        assertThrows(SqlExecutionException.class,
                () -> service.executePagedFirstPage(9L, entity, "shop", "select bad", 500));

        verify(outboundEventSignals).sqlExecutionFailed(
                eq("conn-1"),
                eq("demo"),
                eq("shop"),
                eq("syntax error near category"),
                eq(9L)
        );
    }

    @Test
    void fetchCursorPage_usesManualSessionConnectionWhenPresent() throws SQLException {
        when(connectorFacade.jdbc()).thenReturn(jdbcAccess);
        when(jdbcAccess.session()).thenReturn(jdbcSessionAccess);
        ConnectionEntity entity = connectionEntity("conn-1");
        when(connectionContext.requireUserId()).thenReturn(1L);
        when(cursorStore.require(1L, "cursor-1")).thenReturn(new SqlResultCursorStore.CursorEntry(
                1L, "conn-1", "shop", "select * from t", "tab-1", 2, 2, List.of(), System.currentTimeMillis()
        ));
        when(connectionContext.requireAvailableConnection(1L, "conn-1", "Connection not found: conn-1"))
                .thenReturn(new ConnectionExecutionContext.ResolvedConnection(1L, entity));
        when(jdbcSessionAccess.requireManualSession(1L, "tab-1")).thenReturn(managedSession);
        ExecuteSqlResult pageResult = new ExecuteSqlResult(
                "select * from t", 1, 3, List.of(), List.of(Map.of("id", 2)),
                null, null, null, false, 2, 2
        );
        when(jdbcSessionAccess.executeSelectPageInManualSession(
                1L, "tab-1", entity, "shop", "select * from t", 2, 2, "1:tab-1"
        )).thenReturn(pageResult);

        ExecuteSqlResult page = service.fetchCursorPage("cursor-1", null);

        assertEquals(1, page.rowCount());
        assertFalse(Boolean.TRUE.equals(page.hasMore()));
        verify(jdbcSessionAccess).executeSelectPageInManualSession(
                1L, "tab-1", entity, "shop", "select * from t", 2, 2, "1:tab-1"
        );
        verify(jdbcAccess, never()).executeSelectPage(
                eq(entity), eq("select * from t"), eq("shop"), eq(2), eq(2)
        );
        verify(cursorStore).remove("cursor-1");
    }

    @Test
    void fetchCursorPage_rejectsDeepOffsetBeyondLimit() throws SQLException {
        ConnectionEntity entity = connectionEntity("conn-1");
        when(connectionContext.requireUserId()).thenReturn(1L);
        when(cursorStore.require(1L, "cursor-deep")).thenReturn(new SqlResultCursorStore.CursorEntry(
                1L, "conn-1", "shop", "select * from t", null, 500, 100_001, List.of(), System.currentTimeMillis()
        ));
        when(connectionContext.requireAvailableConnection(1L, "conn-1", "Connection not found: conn-1"))
                .thenReturn(new ConnectionExecutionContext.ResolvedConnection(1L, entity));

        assertThrows(SqlDeepOffsetException.class, () -> service.fetchCursorPage("cursor-deep", null));
        verify(jdbcAccess, never()).executeSelectPage(
                eq(entity), eq("select * from t"), eq("shop"), eq(500), eq(100_001)
        );
    }

    private static ConnectionEntity connectionEntity(String id) {
        ConnectionEntity entity = new ConnectionEntity();
        entity.setId(id);
        entity.setDbType("mysql");
        return entity;
    }

    private static DatawiseQueryProperties unlimitedQueryProperties() {
        DatawiseQueryProperties properties = new DatawiseQueryProperties();
        properties.setMaxResultRows(0);
        return properties;
    }
}
