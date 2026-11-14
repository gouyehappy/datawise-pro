package org.apache.datawise.backend.database.connection;

import org.apache.datawise.backend.config.ConnectionLifecycleProperties;
import org.apache.datawise.backend.database.explorer.ExplorerConnectionLifecycleService;
import org.apache.datawise.backend.jdbc.connection.ConnectionActivityRegistry;
import org.apache.datawise.backend.jdbc.support.JdbcConnectionPoolManager;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;

import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ConnectionIdleEvictionServiceTest {

    @Mock
    private JdbcConnectionPoolManager poolManager;
    @Mock
    private ConnectionActivityRegistry activityRegistry;
    @Mock
    private ExplorerConnectionLifecycleService connectionLifecycleService;

    private ConnectionLifecycleProperties properties;
    private ConnectionIdleEvictionService service;

    @BeforeEach
    void setUp() {
        properties = new ConnectionLifecycleProperties();
        properties.setIdleEvictEnabled(true);
        properties.setIdleEvictMs(1_800_000);
        properties.setMaxActivePools(0);
        service = new ConnectionIdleEvictionService(
                properties,
                poolManager,
                activityRegistry,
                connectionLifecycleService
        );
    }

    @Test
    void evictIdleConnectionsScheduled_evictsStalePooledConnections() {
        when(poolManager.listPooledConnectionIds()).thenReturn(List.of("conn-stale", "conn-active"));
        when(activityRegistry.getLastActivityMs("conn-stale")).thenReturn(System.currentTimeMillis() - 2_000_000L);
        when(activityRegistry.getLastActivityMs("conn-active")).thenReturn(System.currentTimeMillis());

        service.evictIdleConnectionsScheduled();

        verify(connectionLifecycleService).evictIdleResources("conn-stale");
        verify(connectionLifecycleService, never()).evictIdleResources("conn-active");
    }

    @Test
    void evictIdleConnectionsScheduled_skipsIdleWhenDisabled() {
        properties.setIdleEvictEnabled(false);

        service.evictIdleConnectionsScheduled();

        verify(poolManager, never()).listPooledConnectionIds();
    }

    @Test
    void trimExcessPools_evictsLeastRecentlyUsed() {
        properties.setIdleEvictEnabled(false);
        properties.setMaxActivePools(2);
        when(poolManager.listPooledConnectionIds()).thenReturn(List.of("old", "mid", "fresh"));
        when(activityRegistry.getLastActivityMs("old")).thenReturn(100L);
        when(activityRegistry.getLastActivityMs("mid")).thenReturn(200L);
        when(activityRegistry.getLastActivityMs("fresh")).thenReturn(300L);

        service.evictIdleConnectionsScheduled();

        verify(connectionLifecycleService, times(1)).evictIdleResources("old");
        verify(connectionLifecycleService, never()).evictIdleResources("mid");
        verify(connectionLifecycleService, never()).evictIdleResources("fresh");
    }
}
