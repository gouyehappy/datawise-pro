package org.apache.datawise.backend.connector.support;

import org.apache.datawise.backend.common.SqlExecutionException;
import org.apache.datawise.backend.common.TableDataException;
import org.apache.datawise.backend.connector.ConnectorCapability;
import org.apache.datawise.backend.connector.DataSourceConnector;
import org.apache.datawise.backend.connector.facade.ConnectorFacade;
import org.apache.datawise.backend.connector.facade.catalog.ConnectorCatalogAccess;
import org.apache.datawise.backend.connector.facade.ops.ConnectorOpsAccess;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.apache.datawise.backend.ops.DatabaseOpsRegistry;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.EnumSet;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ConnectorCapabilityGuardTest {

    @Mock
    private ConnectorFacade facade;
    @Mock
    private ConnectorCatalogAccess catalogAccess;
    @Mock
    private ConnectorOpsAccess opsAccess;
    @Mock
    private DatabaseOpsRegistry opsRegistry;
    @Mock
    private DataSourceConnector connector;

    @BeforeEach
    void stubFacade() {
        when(facade.catalog()).thenReturn(catalogAccess);
        when(facade.ops()).thenReturn(opsAccess);
        when(opsAccess.registry()).thenReturn(opsRegistry);
        lenient().when(opsRegistry.supportsActiveSession(org.mockito.ArgumentMatchers.anyString())).thenReturn(false);
        lenient().when(opsRegistry.supportsSessionKill(org.mockito.ArgumentMatchers.anyString())).thenReturn(false);
        lenient().when(opsRegistry.supportsLockWait(org.mockito.ArgumentMatchers.anyString())).thenReturn(false);
    }

    @Test
    void requireSqlExecute_allowsJdbcConnector() {
        ConnectionEntity entity = entity("mysql");
        when(catalogAccess.resolve(entity)).thenReturn(connector);
        when(connector.capabilities()).thenReturn(EnumSet.of(ConnectorCapability.SQL_EXECUTE));

        assertDoesNotThrow(() -> ConnectorCapabilityGuard.requireSqlExecute(facade, entity));
    }

    @Test
    void requireSqlExecute_rejectsMongoDb() {
        ConnectionEntity entity = entity("mongodb");
        when(catalogAccess.resolve(entity)).thenReturn(connector);
        when(connector.capabilities()).thenReturn(EnumSet.of(
                ConnectorCapability.CONNECTION_TEST,
                ConnectorCapability.CATALOG));

        SqlExecutionException ex = assertThrows(
                SqlExecutionException.class,
                () -> ConnectorCapabilityGuard.requireSqlExecute(facade, entity));
        assertEquals("SQL execution is not supported for datasource type: mongodb", ex.getMessage());
    }

    @Test
    void hasSessionMonitor_usesMergedOpsCapabilities() {
        ConnectionEntity entity = entity("mysql");
        when(catalogAccess.resolve(entity)).thenReturn(connector);
        when(connector.capabilities()).thenReturn(EnumSet.of(ConnectorCapability.SQL_EXECUTE));
        when(opsRegistry.supportsActiveSession("mysql")).thenReturn(true);

        assertTrue(ConnectorCapabilityGuard.hasSessionMonitor(facade, entity));
    }

    @Test
    void hasSessionMonitor_falseWhenOpsUnsupported() {
        ConnectionEntity entity = entity("trino");
        when(catalogAccess.resolve(entity)).thenReturn(connector);
        when(connector.capabilities()).thenReturn(EnumSet.of(
                ConnectorCapability.SQL_EXECUTE,
                ConnectorCapability.SQL_EXPLAIN));

        assertFalse(ConnectorCapabilityGuard.hasSessionMonitor(facade, entity));
    }

    @Test
    void requireTableData_allowsDocumentReadConnector() {
        ConnectionEntity entity = entity("mongodb");
        when(catalogAccess.resolve(entity)).thenReturn(connector);
        when(connector.capabilities()).thenReturn(EnumSet.of(
                ConnectorCapability.CONNECTION_TEST,
                ConnectorCapability.CATALOG,
                ConnectorCapability.DOCUMENT_READ));

        assertDoesNotThrow(() -> ConnectorCapabilityGuard.requireTableData(facade, entity));
    }

    @Test
    void requireTableData_rejectsMongoDbWithoutDocumentRead() {
        ConnectionEntity entity = entity("mongodb");
        when(catalogAccess.resolve(entity)).thenReturn(connector);
        when(connector.capabilities()).thenReturn(EnumSet.of(
                ConnectorCapability.CONNECTION_TEST,
                ConnectorCapability.CATALOG));

        TableDataException ex = assertThrows(
                TableDataException.class,
                () -> ConnectorCapabilityGuard.requireTableData(facade, entity));
        assertEquals("Table data browsing is not supported for datasource type: mongodb", ex.getMessage());
    }

    @Test
    void requireDml_rejectsDocumentReadOnlyConnector() {
        ConnectionEntity entity = entity("mongodb");
        when(catalogAccess.resolve(entity)).thenReturn(connector);
        when(connector.capabilities()).thenReturn(EnumSet.of(
                ConnectorCapability.CONNECTION_TEST,
                ConnectorCapability.CATALOG,
                ConnectorCapability.DOCUMENT_READ));

        TableDataException ex = assertThrows(
                TableDataException.class,
                () -> ConnectorCapabilityGuard.requireDml(facade, entity));
        assertEquals("Table row mutations are not supported for datasource type: mongodb", ex.getMessage());
    }

    @Test
    void requireDml_allowsJdbcConnector() {
        ConnectionEntity entity = entity("mysql");
        when(catalogAccess.resolve(entity)).thenReturn(connector);
        when(connector.capabilities()).thenReturn(EnumSet.of(
                ConnectorCapability.SQL_EXECUTE,
                ConnectorCapability.DML));

        assertDoesNotThrow(() -> ConnectorCapabilityGuard.requireDml(facade, entity));
    }

    private static ConnectionEntity entity(String dbType) {
        ConnectionEntity entity = new ConnectionEntity();
        entity.setId("conn-1");
        entity.setDbType(dbType);
        return entity;
    }
}
