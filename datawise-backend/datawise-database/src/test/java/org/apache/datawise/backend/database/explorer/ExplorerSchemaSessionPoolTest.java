package org.apache.datawise.backend.database.explorer;

import org.apache.datawise.backend.config.ExplorerSchemaProperties;
import org.apache.datawise.backend.connector.catalog.SchemaSession;
import org.apache.datawise.backend.connector.facade.ConnectorFacade;
import org.apache.datawise.backend.connector.facade.catalog.ConnectorCatalogAccess;
import org.apache.datawise.backend.jdbc.connection.ConnectionActivityRegistry;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.beans.factory.ObjectProvider;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ExplorerSchemaSessionPoolTest {

    @Mock
    private ConnectorFacade connectorFacade;
    @Mock
    private ConnectorCatalogAccess catalogAccess;
    @Mock
    private SchemaSession schemaSession;

    @Mock
    private ConnectionActivityRegistry activityRegistry;

    private ExplorerSchemaSessionPool pool;
    private ConnectionEntity entity;

    @BeforeEach
    void setUp() throws Exception {
        when(connectorFacade.catalog()).thenReturn(catalogAccess);
        when(catalogAccess.openSchemaSession(any())).thenReturn(schemaSession);
        when(schemaSession.connectionId()).thenReturn("conn-1");
        lenient().when(schemaSession.isConnectionUsable()).thenReturn(true);

        ExplorerSchemaProperties properties = new ExplorerSchemaProperties();
        properties.setIdleTimeoutMs(120_000);
        properties.setMaxEntries(16);

        @SuppressWarnings("unchecked")
        ObjectProvider<io.micrometer.core.instrument.MeterRegistry> meterRegistryProvider =
                mock(ObjectProvider.class);
        when(meterRegistryProvider.getIfAvailable()).thenReturn(null);
        pool = new ExplorerSchemaSessionPool(connectorFacade, properties, activityRegistry, meterRegistryProvider);

        entity = new ConnectionEntity();
        entity.setId("conn-1");
        entity.setDbType("mysql");
        entity.setName("local");
    }

    @Test
    void withSession_reusesActiveSessionForSameConnection() throws Exception {
        String first = pool.withSession(entity, session -> session.connectionId());
        String second = pool.withSession(entity, session -> session.connectionId());

        assertEquals("conn-1", first);
        assertEquals("conn-1", second);
        verify(catalogAccess, times(1)).openSchemaSession(entity);
    }

    @Test
    void invalidate_forcesNewSessionOnNextAccess() throws Exception {
        pool.withSession(entity, SchemaSession::connectionId);
        pool.invalidate("conn-1");
        pool.withSession(entity, SchemaSession::connectionId);

        verify(catalogAccess, times(2)).openSchemaSession(entity);
    }

    @Test
    void withSession_reopensWhenCachedSessionIsNoLongerUsable() throws Exception {
        pool.withSession(entity, SchemaSession::connectionId);
        when(schemaSession.isConnectionUsable()).thenReturn(false);
        pool.withSession(entity, SchemaSession::connectionId);

        verify(catalogAccess, times(2)).openSchemaSession(entity);
    }
}
