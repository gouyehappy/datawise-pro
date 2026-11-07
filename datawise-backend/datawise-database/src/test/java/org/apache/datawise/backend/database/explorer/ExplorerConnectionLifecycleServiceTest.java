package org.apache.datawise.backend.database.explorer;

import org.apache.datawise.backend.connector.facade.ConnectorFacade;
import org.apache.datawise.backend.connector.facade.catalog.ConnectorCatalogAccess;
import org.apache.datawise.backend.database.context.ConnectionExecutionContext;
import org.apache.datawise.backend.domain.ConnectionTestResult;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.apache.datawise.backend.jdbc.connection.ConnectionActivityRegistry;
import org.apache.datawise.backend.jdbc.support.JdbcConnectionPoolManager;
import org.apache.datawise.backend.jdbc.support.JdbcDriverConnectionFactory;
import org.apache.datawise.backend.database.connection.JdbcConnectionPoolWarmupService;
import org.apache.datawise.backend.service.outbound.OutboundEventSignals;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ExplorerConnectionLifecycleServiceTest {

    @Mock
    private ConnectionExecutionContext connectionContext;
    @Mock
    private ConnectorFacade connectorFacade;
    @Mock
    private ConnectorCatalogAccess catalogAccess;
    @Mock
    private JdbcDriverConnectionFactory jdbcDriverConnectionFactory;
    @Mock
    private ExplorerSchemaSessionPool schemaSessionPool;
    @Mock
    private JdbcConnectionPoolWarmupService poolWarmupService;
    @Mock
    private ConnectionActivityRegistry activityRegistry;
    @Mock
    private JdbcConnectionPoolManager poolManager;
    @Mock
    private OutboundEventSignals outboundEventSignals;

    private ExplorerConnectionLifecycleService service;

    @BeforeEach
    void setUp() {
        service = new ExplorerConnectionLifecycleService(
                connectionContext,
                connectorFacade,
                jdbcDriverConnectionFactory,
                schemaSessionPool,
                poolWarmupService,
                activityRegistry,
                poolManager,
                outboundEventSignals
        );
    }

    @Test
    void disconnect_invalidatesSchemaSessionBeforeEvictingPool() {
        stubConnection("conn-1");

        service.disconnect("conn-1");

        var order = inOrder(schemaSessionPool, jdbcDriverConnectionFactory);
        order.verify(schemaSessionPool).invalidate("conn-1");
        order.verify(jdbcDriverConnectionFactory).evictPool("conn-1");
    }

    @Test
    void connect_warmupSuccessSkipsSeparateProbe() {
        ConnectionEntity entity = stubConnection("conn-2");
        when(poolWarmupService.warmupForConnect(entity)).thenReturn(new JdbcConnectionPoolWarmupService.WarmupResult(1, 2));

        ConnectionTestResult result = service.connect("conn-2");

        assertTrue(result.ok());
        assertTrue(result.message().contains("pool warmed"));
        verify(poolWarmupService).warmupForConnect(entity);
        verify(catalogAccess, never()).pingConnection(entity);
        verify(catalogAccess, never()).testConnection(entity);
    }

    @Test
    void connect_fallsBackToPingWhenWarmupFails() {
        ConnectionEntity entity = stubConnection("conn-4");
        when(connectorFacade.catalog()).thenReturn(catalogAccess);
        when(poolWarmupService.warmupForConnect(entity)).thenReturn(new JdbcConnectionPoolWarmupService.WarmupResult(0, 2));
        when(catalogAccess.pingConnection(entity)).thenReturn(new ConnectionTestResult(false, "fail", 3));

        ConnectionTestResult result = service.connect("conn-4");

        assertFalse(result.ok());
        verify(poolWarmupService).warmupForConnect(entity);
        verify(catalogAccess).pingConnection(entity);
    }

    @Test
    void ping_delegatesToCatalogPing() {
        ConnectionEntity entity = stubConnection("conn-ping");
        when(connectorFacade.catalog()).thenReturn(catalogAccess);
        when(catalogAccess.pingConnection(entity)).thenReturn(new ConnectionTestResult(true, "reachable", 2));

        ConnectionTestResult result = service.ping("conn-ping");

        assertTrue(result.ok());
        verify(catalogAccess).pingConnection(entity);
    }

    @Test
    void reconnect_disconnectsBeforeTesting() {
        ConnectionEntity entity = stubConnection("conn-3");
        when(poolWarmupService.warmupForConnect(entity)).thenReturn(new JdbcConnectionPoolWarmupService.WarmupResult(1, 1));

        ConnectionTestResult result = service.reconnect("conn-3");

        assertTrue(result.ok());
        verify(jdbcDriverConnectionFactory).evictPool("conn-3");
        verify(schemaSessionPool).invalidate("conn-3");
        verify(poolWarmupService).warmupForConnect(entity);
        verify(catalogAccess, never()).testConnection(entity);
    }

    private ConnectionEntity stubConnection(String connectionId) {
        ConnectionEntity entity = new ConnectionEntity();
        entity.setId(connectionId);
        entity.setDbType("mysql");
        when(connectionContext.requireAvailableConnectionForCurrentUser(
                eq(connectionId),
                eq(ConnectionExecutionContext.EXPLORER_CONNECTION_NOT_FOUND)
        )).thenReturn(new ConnectionExecutionContext.ResolvedConnection(1L, entity));
        return entity;
    }
}
