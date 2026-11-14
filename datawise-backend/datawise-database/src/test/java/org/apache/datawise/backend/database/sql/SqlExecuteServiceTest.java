package org.apache.datawise.backend.database.sql;

import org.apache.datawise.backend.common.SqlSessionGoneException;
import org.apache.datawise.backend.connector.ConnectorCapability;
import org.apache.datawise.backend.connector.DataSourceConnector;
import org.apache.datawise.backend.connector.facade.catalog.ConnectorCatalogAccess;
import org.apache.datawise.backend.connector.facade.jdbc.ConnectorJdbcAccess;
import org.apache.datawise.backend.connector.facade.jdbc.ConnectorJdbcSessionAccess;
import org.apache.datawise.backend.connector.facade.ops.ConnectorOpsAccess;
import org.apache.datawise.backend.connector.hook.SqlExecutionHookRunner;
import org.apache.datawise.backend.config.DatawiseQueryProperties;
import org.apache.datawise.backend.database.context.ConnectionExecutionContext;
import org.apache.datawise.backend.domain.ExecuteSqlRequest;
import org.apache.datawise.backend.domain.ExecuteSqlResult;
import org.apache.datawise.backend.jdbc.session.JdbcManualSessionStore.ManagedSession;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.apache.datawise.backend.service.ConnectionAccessService;
import org.apache.datawise.backend.service.ProductionWriteGuardService;
import org.apache.datawise.backend.service.outbound.OutboundEventSignals;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.EnumSet;
import java.util.List;
import java.util.Map;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class SqlExecuteServiceTest {

    @Mock
    private ConnectionExecutionContext connectionContext;
    @Mock
    private org.apache.datawise.backend.connector.facade.ConnectorFacade connectorFacade;
    @Mock
    private ConnectionAccessService connectionAccessService;
    @Mock
    private ProductionWriteGuardService productionWriteGuardService;
    @Mock
    private SqlCursorService sqlCursorService;
    @Mock
    private ConnectorJdbcAccess jdbcAccess;
    @Mock
    private ConnectorJdbcSessionAccess jdbcSessionAccess;
    @Mock
    private ConnectorCatalogAccess catalogAccess;
    @Mock
    private ConnectorOpsAccess opsAccess;
    @Mock
    private DataSourceConnector connector;
    @Mock
    private ManagedSession managedSession;
    @Mock
    private OutboundEventSignals outboundEventSignals;

    private SqlExecutionHookRunner sqlExecutionHookRunner;

    private SqlExecuteService service;

    @BeforeEach
    void setUp() {
        sqlExecutionHookRunner = new SqlExecutionHookRunner(List.of());
        DatawiseQueryProperties unlimited = unlimitedQueryProperties();
        unlimited.setMaxConcurrentGlobal(0);
        unlimited.setMaxConcurrentPerUser(0);
        org.mockito.Mockito.lenient().when(connectionContext.requireUserId()).thenReturn(9L);
        service = new SqlExecuteService(
                connectionContext,
                connectorFacade,
                new QueryLimitResolver(unlimited),
                connectionAccessService,
                productionWriteGuardService,
                sqlCursorService,
                sqlExecutionHookRunner,
                outboundEventSignals,
                new SqlQueryAdmissionService(unlimited),
                mock(org.springframework.context.ApplicationEventPublisher.class),
                mock(org.apache.datawise.backend.database.ddlhistory.DdlHistoryService.class)
        );
    }

    @Test
    void execute_withCursorId_delegatesToCursorService() {
        when(connectionContext.requireUserId()).thenReturn(9L);
        ExecuteSqlRequest request = new ExecuteSqlRequest(
                null,
                "conn-1",
                null,
                null,
                null,
                100,
                "cursor-1",
                null
        );
        ExecuteSqlResult expected = new ExecuteSqlResult(
                "select 1", 1, 0, null, null, null, null, null, false, 0, 100
        );
        when(sqlCursorService.fetchCursorPage("cursor-1", 100)).thenReturn(expected);

        ExecuteSqlResult result = service.execute(request);

        assertEquals(expected, result);
        verify(sqlCursorService).fetchCursorPage("cursor-1", 100);
    }

    @Test
    void execute_rejectsBlankSql() {
        when(connectionContext.requireUserId()).thenReturn(9L);
        ExecuteSqlRequest request = new ExecuteSqlRequest("   ", "conn-1", null, null, null, null, null, null);

        IllegalArgumentException ex = assertThrows(IllegalArgumentException.class, () -> service.execute(request));
        assertEquals("SQL is required", ex.getMessage());
    }

    @Test
    void execute_rejectsMissingConnectionId() {
        when(connectionContext.requireUserId()).thenReturn(9L);
        ExecuteSqlRequest request = new ExecuteSqlRequest("select 1", null, null, null, null, null, null, null);

        IllegalArgumentException ex = assertThrows(IllegalArgumentException.class, () -> service.execute(request));
        assertEquals("connectionId is required", ex.getMessage());
    }

    @Test
    void execute_enforcesSqlWriteAccessForMutatingStatements() {
        when(connectionContext.requireUserId()).thenReturn(9L);
        ConnectionEntity entity = connectionEntity();
        when(connectionContext.requireAvailableConnectionForCurrentUser(
                "conn-1",
                "Connection not found: conn-1"
        )).thenReturn(new ConnectionExecutionContext.ResolvedConnection(9L, entity));
        doThrow(new IllegalArgumentException("Read-only access for connection: conn-1"))
                .when(connectionAccessService)
                .requireSqlWriteAccess(9L, "conn-1", "delete from users");

        ExecuteSqlRequest request = new ExecuteSqlRequest(
                "delete from users",
                "conn-1",
                null,
                null,
                null,
                null,
                null,
                null
        );

        IllegalArgumentException ex = assertThrows(IllegalArgumentException.class, () -> service.execute(request));
        assertEquals("Read-only access for connection: conn-1", ex.getMessage());
        verify(connectionAccessService).requireEngineFeature(9L, "conn-1", "queryExecution");
        verify(connectionAccessService).requireSqlWriteAccess(9L, "conn-1", "delete from users");
    }

    @Test
    void execute_sqlException_publishesSqlExecutionFailedSignal() throws Exception {
        ConnectionEntity entity = connectionEntity();
        entity.setName("demo");
        when(connectionContext.requireAvailableConnectionForCurrentUser(
                "conn-1",
                "Connection not found: conn-1"
        )).thenReturn(new ConnectionExecutionContext.ResolvedConnection(9L, entity));
        stubSqlCapabilities(entity);
        when(connectorFacade.jdbc()).thenReturn(jdbcAccess);
        when(jdbcAccess.session()).thenReturn(jdbcSessionAccess);
        when(jdbcSessionAccess.requireManualSession(9L, null)).thenReturn(null);
        when(jdbcAccess.execute(eq(entity), eq("select bad"), isNull(), anyInt()))
                .thenThrow(new java.sql.SQLException("syntax error near category"));

        ExecuteSqlRequest request = new ExecuteSqlRequest(
                "select bad",
                "conn-1",
                null,
                null,
                null,
                null,
                null,
                null
        );

        assertThrows(Exception.class, () -> service.execute(request));
        verify(outboundEventSignals).sqlExecutionFailed(
                eq("conn-1"),
                eq("demo"),
                eq(""),
                eq("syntax error near category"),
                eq(9L)
        );
    }

    @Test
    void execute_createTable_publishesTableCreatedSignal() throws Exception {
        ConnectionEntity entity = connectionEntity();
        entity.setName("demo");
        when(connectionContext.requireAvailableConnectionForCurrentUser(
                "conn-1",
                "Connection not found: conn-1"
        )).thenReturn(new ConnectionExecutionContext.ResolvedConnection(9L, entity));
        stubSqlCapabilities(entity);
        when(connectorFacade.jdbc()).thenReturn(jdbcAccess);
        when(jdbcAccess.session()).thenReturn(jdbcSessionAccess);
        when(jdbcSessionAccess.requireManualSession(9L, null)).thenReturn(null);
        ExecuteSqlResult ok = new ExecuteSqlResult(
                "CREATE TABLE orders (id INT)", 0, 1, null, null, null, null, null, false, 0, null
        );
        when(jdbcAccess.execute(eq(entity), eq("CREATE TABLE orders (id INT)"), eq("shop"), anyInt()))
                .thenReturn(ok);

        ExecuteSqlRequest request = new ExecuteSqlRequest(
                "CREATE TABLE orders (id INT)",
                "conn-1",
                "shop",
                null,
                null,
                null,
                null,
                null
        );

        assertEquals(ok, service.execute(request));
        verify(outboundEventSignals).tableCreated(
                eq("conn-1"),
                eq("demo"),
                eq("shop"),
                eq("orders"),
                eq(9L)
        );
    }

    @Test
    void execute_dropTable_publishesTableDeletedSignal() throws Exception {
        ConnectionEntity entity = connectionEntity();
        entity.setName("demo");
        when(connectionContext.requireAvailableConnectionForCurrentUser(
                "conn-1",
                "Connection not found: conn-1"
        )).thenReturn(new ConnectionExecutionContext.ResolvedConnection(9L, entity));
        stubSqlCapabilities(entity);
        when(connectorFacade.jdbc()).thenReturn(jdbcAccess);
        when(jdbcAccess.session()).thenReturn(jdbcSessionAccess);
        when(jdbcSessionAccess.requireManualSession(9L, null)).thenReturn(null);
        String sql = "DROP TABLE IF EXISTS `shop`.`orders`";
        ExecuteSqlResult ok = new ExecuteSqlResult(sql, 0, 1, null, null, null, null, null, false, 0, null);
        when(jdbcAccess.execute(eq(entity), eq(sql), eq("shop"), anyInt())).thenReturn(ok);

        ExecuteSqlRequest request = new ExecuteSqlRequest(
                sql,
                "conn-1",
                "shop",
                null,
                null,
                null,
                null,
                null
        );

        assertEquals(ok, service.execute(request));
        verify(outboundEventSignals).tableDeleted(
                eq("conn-1"),
                eq("demo"),
                eq("shop"),
                eq("orders"),
                eq(9L)
        );
    }

    @Test
    void execute_alterTable_publishesTableAlteredSignal() throws Exception {
        ConnectionEntity entity = connectionEntity();
        entity.setName("demo");
        when(connectionContext.requireAvailableConnectionForCurrentUser(
                "conn-1",
                "Connection not found: conn-1"
        )).thenReturn(new ConnectionExecutionContext.ResolvedConnection(9L, entity));
        stubSqlCapabilities(entity);
        when(connectorFacade.jdbc()).thenReturn(jdbcAccess);
        when(jdbcAccess.session()).thenReturn(jdbcSessionAccess);
        when(jdbcSessionAccess.requireManualSession(9L, null)).thenReturn(null);
        String sql = "ALTER TABLE orders ADD COLUMN note VARCHAR(32)";
        ExecuteSqlResult ok = new ExecuteSqlResult(sql, 0, 0, null, null, null, null, null, false, 0, null);
        when(jdbcAccess.execute(eq(entity), eq(sql), eq("shop"), anyInt())).thenReturn(ok);

        ExecuteSqlRequest request = new ExecuteSqlRequest(
                sql,
                "conn-1",
                "shop",
                null,
                null,
                null,
                null,
                null
        );

        assertEquals(ok, service.execute(request));
        verify(outboundEventSignals).tableAltered(
                eq("conn-1"),
                eq("demo"),
                eq("shop"),
                eq("orders"),
                eq(9L)
        );
    }

    @Test
    void execute_rejectsMissingManualSessionInsteadOfAutocommitFallback() throws Exception {
        ConnectionEntity entity = connectionEntity();
        when(connectionContext.requireAvailableConnectionForCurrentUser(
                "conn-1",
                "Connection not found: conn-1"
        )).thenReturn(new ConnectionExecutionContext.ResolvedConnection(9L, entity));
        stubSqlCapabilities(entity);
        when(connectorFacade.jdbc()).thenReturn(jdbcAccess);
        when(jdbcAccess.session()).thenReturn(jdbcSessionAccess);
        when(jdbcSessionAccess.requireManualSession(9L, "tab-1")).thenReturn(managedSession);
        when(jdbcSessionAccess.executeInManualSession(
                eq(9L),
                eq("tab-1"),
                eq(entity),
                isNull(),
                anyString(),
                anyInt(),
                anyString()
        )).thenReturn(null);

        ExecuteSqlRequest request = new ExecuteSqlRequest(
                "update users set active = 1",
                "conn-1",
                null,
                null,
                "tab-1",
                null,
                null,
                null
        );

        SqlSessionGoneException ex = assertThrows(SqlSessionGoneException.class, () -> service.execute(request));
        assertEquals(SqlSessionGoneException.DEFAULT_MESSAGE, ex.getMessage());
    }

    @Test
    void execute_manualSessionSelect_usesSqlLimitOnHeldConnection() throws Exception {
        ConnectionEntity entity = connectionEntity();
        when(connectionContext.requireAvailableConnectionForCurrentUser(
                "conn-1",
                "Connection not found: conn-1"
        )).thenReturn(new ConnectionExecutionContext.ResolvedConnection(9L, entity));
        stubSqlCapabilities(entity);
        when(connectorFacade.jdbc()).thenReturn(jdbcAccess);
        when(jdbcAccess.session()).thenReturn(jdbcSessionAccess);
        when(jdbcSessionAccess.requireManualSession(9L, "tab-1")).thenReturn(managedSession);
        when(sqlCursorService.resolvePageSize(500)).thenReturn(500);
        ExecuteSqlResult page = new ExecuteSqlResult(
                "select * from t", 1, 2, List.of(), List.of(Map.of("id", 1)),
                null, null, null, true, 0, 500
        );
        when(jdbcSessionAccess.executeSelectPageInManualSession(
                eq(9L),
                eq("tab-1"),
                eq(entity),
                isNull(),
                eq("select * from t"),
                eq(500),
                eq(0),
                eq("9:tab-1")
        )).thenReturn(page);
        when(sqlCursorService.attachCursorIfHasMore(
                eq(9L),
                eq(entity),
                isNull(),
                eq("select * from t"),
                eq("tab-1"),
                eq(page),
                eq(500)
        )).thenReturn(page);

        ExecuteSqlRequest request = new ExecuteSqlRequest(
                "select * from t",
                "conn-1",
                null,
                null,
                "tab-1",
                500,
                null,
                null
        );

        assertEquals(page, service.execute(request));
        verify(jdbcSessionAccess).executeSelectPageInManualSession(
                9L, "tab-1", entity, null, "select * from t", 500, 0, "9:tab-1"
        );
        verify(sqlCursorService).attachCursorIfHasMore(
                9L, entity, null, "select * from t", "tab-1", page, 500
        );
    }

    private void stubSqlCapabilities(ConnectionEntity entity) {
        when(connectorFacade.catalog()).thenReturn(catalogAccess);
        when(connectorFacade.ops()).thenReturn(opsAccess);
        when(opsAccess.registry()).thenReturn(null);
        when(catalogAccess.resolve(entity)).thenReturn(connector);
        when(connector.capabilities()).thenReturn(EnumSet.of(ConnectorCapability.SQL_EXECUTE));
    }

    private static ConnectionEntity connectionEntity() {
        ConnectionEntity entity = new ConnectionEntity();
        entity.setId("conn-1");
        entity.setDbType("mysql");
        return entity;
    }

    private static DatawiseQueryProperties unlimitedQueryProperties() {
        DatawiseQueryProperties properties = new DatawiseQueryProperties();
        properties.setMaxResultRows(0);
        return properties;
    }
}
