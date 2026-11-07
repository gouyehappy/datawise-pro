package org.apache.datawise.backend.database.table;

import org.apache.datawise.backend.common.TableDataException;
import org.apache.datawise.backend.connector.ConnectorCapability;
import org.apache.datawise.backend.connector.DataSourceConnector;
import org.apache.datawise.backend.connector.facade.ConnectorFacade;
import org.apache.datawise.backend.connector.facade.catalog.ConnectorCatalogAccess;
import org.apache.datawise.backend.connector.facade.dml.ConnectorDmlAccess;
import org.apache.datawise.backend.connector.facade.jdbc.ConnectorJdbcAccess;
import org.apache.datawise.backend.connector.facade.ops.ConnectorOpsAccess;
import org.apache.datawise.backend.ops.DatabaseOpsRegistry;
import org.apache.datawise.backend.domain.TableColumnDetail;
import org.apache.datawise.backend.domain.TablePropertiesResult;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.apache.datawise.backend.database.context.ConnectionExecutionContext;
import org.apache.datawise.backend.database.context.ConnectionExecutionContext.ResolvedConnectionWithDatabase;
import org.apache.datawise.backend.service.ConnectionAccessService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.sql.SQLException;
import java.util.EnumSet;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class TableDataMutationServiceTest {

    @Mock
    private ConnectionExecutionContext connectionContext;
    @Mock
    private ConnectorFacade connectorFacade;
    @Mock
    private ConnectorDmlAccess dmlAccess;
    @Mock
    private ConnectorJdbcAccess jdbcAccess;
    @Mock
    private TableDetailService tableDetailService;
    @Mock
    private ConnectionAccessService connectionAccessService;
    @Mock
    private TableDataChangeAuditService auditService;
    @Mock
    private ConnectorCatalogAccess catalogAccess;
    @Mock
    private ConnectorOpsAccess opsAccess;
    @Mock
    private DatabaseOpsRegistry opsRegistry;
    @Mock
    private DataSourceConnector connector;

    private TableDataMutationService service;

    @BeforeEach
    void setUp() {
        service = new TableDataMutationService(
                connectionContext,
                connectorFacade,
                tableDetailService,
                connectionAccessService,
                auditService
        );
    }

    @Test
    void deleteRow_rejectsTableWithoutPrimaryKey() {
        stubContext();
        when(tableDetailService.loadProperties("users", "conn-1", "shop"))
                .thenReturn(propertiesWithoutPrimaryKey());

        IllegalArgumentException ex = assertThrows(
                IllegalArgumentException.class,
                () -> service.deleteRow("users", "conn-1", "shop", Map.of("name", "alice"))
        );
        assertEquals("Table has no primary key; delete is not supported", ex.getMessage());
    }

    @Test
    void updateRow_rejectsTableWithoutPrimaryKey() {
        stubContext();
        when(tableDetailService.loadProperties("users", "conn-1", "shop"))
                .thenReturn(propertiesWithoutPrimaryKey());

        IllegalArgumentException ex = assertThrows(
                IllegalArgumentException.class,
                () -> service.updateRow(
                        "users",
                        "conn-1",
                        "shop",
                        Map.of("name", "alice"),
                        Map.of("name", "bob")
                )
        );
        assertEquals("Table has no primary key; update is not supported", ex.getMessage());
    }

    @Test
    void insertRow_rejectsDocumentReadOnlyConnector() {
        stubContext("mongodb");
        when(connector.capabilities()).thenReturn(EnumSet.of(
                ConnectorCapability.CONNECTION_TEST,
                ConnectorCapability.CATALOG,
                ConnectorCapability.DOCUMENT_READ
        ));

        TableDataException ex = assertThrows(
                TableDataException.class,
                () -> service.insertRow("users", "conn-1", "shop", Map.of("name", "alice"))
        );
        assertEquals("Table row mutations are not supported for datasource type: mongodb", ex.getMessage());
    }

    @Test
    void insertRow_wrapsJdbcFailureAsTableDataException() throws SQLException {
        stubContext();
        when(connectorFacade.dml()).thenReturn(dmlAccess);
        when(connectorFacade.jdbc()).thenReturn(jdbcAccess);
        when(tableDetailService.loadProperties("users", "conn-1", "shop"))
                .thenReturn(propertiesWithPrimaryKey());
        when(dmlAccess.buildInsert(eq("mysql"), eq("shop"), eq("users"), any()))
                .thenReturn("insert into users (name) values ('alice')");
        when(jdbcAccess.executeUpdate(any(), any(), eq("shop")))
                .thenThrow(new SQLException("Duplicate entry 'alice' for key 'users.name'"));

        TableDataException ex = assertThrows(
                TableDataException.class,
                () -> service.insertRow("users", "conn-1", "shop", Map.of("name", "alice"))
        );
        assertEquals(TableDataException.MUTATION_FAILED, ex.getErrorCode());
        assertTrue(ex.getMessage().contains("Duplicate entry"));
        verify(connectionAccessService).requireDmlAccess(7L, "conn-1");
    }

    private void stubContext() {
        stubContext("mysql");
    }

    private void stubContext(String dbType) {
        ConnectionEntity entity = connectionEntity(dbType);
        when(connectionContext.requireUserId()).thenReturn(7L);
        when(connectionContext.requireAvailableWithDatabaseForCurrentUser(
                "conn-1",
                "shop",
                "Connection not found: conn-1"
        )).thenReturn(new ResolvedConnectionWithDatabase(7L, entity, "shop"));
        when(connectorFacade.catalog()).thenReturn(catalogAccess);
        when(connectorFacade.ops()).thenReturn(opsAccess);
        when(opsAccess.registry()).thenReturn(opsRegistry);
        when(catalogAccess.resolve(entity)).thenReturn(connector);
        when(connector.capabilities()).thenReturn(EnumSet.of(
                ConnectorCapability.SQL_EXECUTE,
                ConnectorCapability.DML
        ));
    }

    private static ConnectionEntity connectionEntity() {
        return connectionEntity("mysql");
    }

    private static ConnectionEntity connectionEntity(String dbType) {
        ConnectionEntity entity = new ConnectionEntity();
        entity.setId("conn-1");
        entity.setDbType(dbType);
        entity.setHost("127.0.0.1");
        entity.setPort("3306");
        return entity;
    }

    private static TablePropertiesResult propertiesWithoutPrimaryKey() {
        return new TablePropertiesResult(
                "users",
                null,
                null,
                null,
                null,
                null,
                List.of(column(1, "name", "", false, true)),
                List.of(),
                List.of()
        );
    }

    private static TablePropertiesResult propertiesWithPrimaryKey() {
        return new TablePropertiesResult(
                "users",
                null,
                null,
                null,
                null,
                null,
                List.of(
                        column(1, "id", "PRI", true, false),
                        column(2, "name", "", false, true)
                ),
                List.of(),
                List.of()
        );
    }

    private static TableColumnDetail column(
            int ordinal,
            String name,
            String keyType,
            boolean autoIncrement,
            boolean nullable
    ) {
        return new TableColumnDetail(
                ordinal,
                name,
                "varchar",
                nullable,
                autoIncrement,
                keyType,
                null,
                null,
                null
        );
    }
}
