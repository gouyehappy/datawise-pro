package org.apache.datawise.backend.database.context;

import org.apache.datawise.backend.common.UnauthorizedException;
import org.apache.datawise.backend.connector.DataSourceConnector;
import org.apache.datawise.backend.connector.facade.ConnectorFacade;
import org.apache.datawise.backend.database.connection.DatasourceCatalogService;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.apache.datawise.backend.service.ConnectionVisibilityService;
import org.apache.datawise.backend.service.UserAccountService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ConnectionExecutionContextTest {

    @Mock
    private UserAccountService userAccountService;
    @Mock
    private ConnectionVisibilityService connectionVisibilityService;
    @Mock
    private DatasourceCatalogService datasourceCatalogService;
    @Mock
    private ConnectorFacade connectorFacade;
    @Mock
    private org.apache.datawise.backend.connector.facade.catalog.ConnectorCatalogAccess catalogAccess;
    @Mock
    private DataSourceConnector connector;

    private ConnectionExecutionContext context;

    @BeforeEach
    void setUp() {
        context = new ConnectionExecutionContext(
                userAccountService,
                connectionVisibilityService,
                datasourceCatalogService,
                connectorFacade
        );
    }

    @Test
    void requireAvailableConnectionForCurrentUser_resolvesEntityAndChecksCatalog() {
        when(userAccountService.requireUserId()).thenReturn(7L);
        ConnectionEntity entity = connectionEntity("conn-1", "mysql");
        when(connectionVisibilityService.resolveConnectionEntity("conn-1")).thenReturn(Optional.of(entity));

        ConnectionExecutionContext.ResolvedConnection resolved =
                context.requireAvailableConnectionForCurrentUser("conn-1", "missing");

        assertEquals(7L, resolved.userId());
        assertSame(entity, resolved.entity());
        verify(datasourceCatalogService).requireAvailable("mysql");
    }

    @Test
    void requireConnectionForCurrentUser_propagatesUnauthorized() {
        when(userAccountService.requireUserId())
                .thenThrow(new UnauthorizedException());

        UnauthorizedException ex = assertThrows(
                UnauthorizedException.class,
                () -> context.requireConnectionForCurrentUser("conn-1", "missing")
        );
        assertEquals(UnauthorizedException.CODE, ex.getMessage());
    }

    @Test
    void requireAvailableWithDatabase_resolvesEffectiveDatabaseWithoutMutatingEntity() {
        when(userAccountService.requireUserId()).thenReturn(3L);
        ConnectionEntity entity = connectionEntity("conn-2", "postgresql");
        when(connectionVisibilityService.resolveConnectionEntity("conn-2")).thenReturn(Optional.of(entity));

        ConnectionExecutionContext.ResolvedConnectionWithDatabase resolved =
                context.requireAvailableWithDatabase(3L, "conn-2", "analytics", "missing");

        assertEquals("analytics", resolved.database());
        assertEquals("default_db", entity.getDatabaseName());
    }

    @Test
    void requireConnection_rejectsMismatchedUserId() {
        when(userAccountService.requireUserId()).thenReturn(7L);

        UnauthorizedException ex = assertThrows(
                UnauthorizedException.class,
                () -> context.requireConnection(99L, "conn-1", "missing")
        );
        assertEquals(UnauthorizedException.CODE, ex.getMessage());
    }

    @Test
    void requireAvailableWithConnector_resolvesConnectorFromRegistry() {
        when(userAccountService.requireUserId()).thenReturn(1L);
        ConnectionEntity entity = connectionEntity("conn-3", "mysql");
        when(connectionVisibilityService.resolveConnectionEntity("conn-3")).thenReturn(Optional.of(entity));
        when(connectorFacade.catalog()).thenReturn(catalogAccess);
        when(catalogAccess.resolve(entity)).thenReturn(connector);

        ConnectionExecutionContext.ResolvedConnectionWithConnector resolved =
                context.requireAvailableWithConnector(1L, "conn-3", "shop", "missing");

        assertSame(connector, resolved.connector());
        assertEquals("shop", resolved.database());
    }

    @Test
    void requireDatabase_throwsWhenMissing() {
        ConnectionEntity entity = connectionEntity("conn-4", "mysql");
        entity.setDatabaseName(null);

        IllegalArgumentException ex = assertThrows(
                IllegalArgumentException.class,
                () -> ConnectionExecutionContext.requireDatabase(entity, null)
        );
        assertEquals("database is required", ex.getMessage());
    }

    private static ConnectionEntity connectionEntity(String id, String dbType) {
        ConnectionEntity entity = new ConnectionEntity();
        entity.setId(id);
        entity.setDbType(dbType);
        entity.setDatabaseName("default_db");
        return entity;
    }
}
