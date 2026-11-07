package org.apache.datawise.backend.ai.schema;

import org.apache.datawise.backend.connector.facade.ConnectorFacade;
import org.apache.datawise.backend.connector.facade.jdbc.ConnectorJdbcAccess;
import org.apache.datawise.backend.connector.facade.schema.ConnectorSchemaAccess;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.apache.datawise.backend.schema.SchemaDialect;
import org.apache.datawise.backend.schema.SchemaScope;
import org.apache.datawise.backend.jdbc.support.JdbcConnectionCallback;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.sql.Connection;
import java.sql.DatabaseMetaData;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AiSchemaJdbcMetadataTest {

    @Mock
    private ConnectorFacade connectorFacade;
    @Mock
    private ConnectorJdbcAccess jdbcAccess;
    @Mock
    private ConnectorSchemaAccess schemaAccess;
    @Mock
    private SchemaDialect schemaDialect;
    @Mock
    private Connection connection;
    @Mock
    private DatabaseMetaData metaData;

    private AiSchemaJdbcMetadata metadata;

    @BeforeEach
    void setUp() {
        metadata = new AiSchemaJdbcMetadata(connectorFacade);
    }

    @Test
    void loadImportedKeyRelations_usesCrossReferenceBulkQuery() throws Exception {
        ConnectionEntity entity = connectionEntity();
        stubConnection(entity, "shop");

        ResultSet crossRef = resultSet(
                row("orders", "customer_id", "customers", "id"),
                row("orders", "product_id", "products", "id")
        );
        when(metaData.getCrossReference(null, "shop", null, null, "shop", null)).thenReturn(crossRef);

        List<AiTableRelationHint> relations = metadata.loadImportedKeyRelations(
                entity,
                "shop",
                Set.of("orders", "customers", "products")
        );

        assertEquals(2, relations.size());
        verify(metaData).getCrossReference(null, "shop", null, null, "shop", null);
    }

    @Test
    void loadImportedKeyRelations_fallsBackToPerTableWhenBulkFails() throws Exception {
        ConnectionEntity entity = connectionEntity();
        stubConnection(entity, "shop");

        when(metaData.getCrossReference(null, "shop", null, null, "shop", null))
                .thenThrow(new SQLException("bulk unsupported"));

        ResultSet ordersKeys = resultSet(row("orders", "customer_id", "customers", "id"));
        ResultSet customersKeys = mock(ResultSet.class);
        when(customersKeys.next()).thenReturn(false);
        when(metaData.getImportedKeys(null, "shop", "orders")).thenReturn(ordersKeys);
        when(metaData.getImportedKeys(null, "shop", "customers")).thenReturn(customersKeys);

        List<AiTableRelationHint> relations = metadata.loadImportedKeyRelations(
                entity,
                "shop",
                Set.of("orders", "customers")
        );

        assertEquals(1, relations.size());
        assertEquals("orders", relations.get(0).fromTable());
        verify(metaData).getImportedKeys(null, "shop", "orders");
    }

    @Test
    void loadImportedKeyRelations_filtersTablesOutsideScope() throws Exception {
        ConnectionEntity entity = connectionEntity();
        stubConnection(entity, "shop");

        ResultSet crossRef = resultSet(row("external_a", "ref_id", "external_b", "id"));
        when(metaData.getCrossReference(null, "shop", null, null, "shop", null)).thenReturn(crossRef);

        List<AiTableRelationHint> relations = metadata.loadImportedKeyRelations(
                entity,
                "shop",
                Set.of("orders")
        );

        assertTrue(relations.isEmpty());
    }

    private void stubConnection(ConnectionEntity entity, String database) throws Exception {
        when(connectorFacade.jdbc()).thenReturn(jdbcAccess);
        when(connectorFacade.schema()).thenReturn(schemaAccess);
        when(schemaAccess.resolve("mysql")).thenReturn(schemaDialect);
        when(schemaDialect.resolveScope(connection, database)).thenReturn(new SchemaScope(null, "shop", "shop"));
        when(connection.getMetaData()).thenReturn(metaData);

        when(jdbcAccess.withConnection(eq(entity), eq(database), any())).thenAnswer(invocation -> {
            JdbcConnectionCallback<?> callback = invocation.getArgument(2);
            return callback.apply(connection);
        });
    }

    private static ConnectionEntity connectionEntity() {
        ConnectionEntity entity = new ConnectionEntity();
        entity.setId("conn-1");
        entity.setDbType("mysql");
        return entity;
    }

    private static ResultSet resultSet(String[]... rows) throws SQLException {
        ResultSet rs = mock(ResultSet.class);
        int[] index = {0};
        when(rs.next()).thenAnswer(inv -> {
            index[0]++;
            return index[0] <= rows.length;
        });
        when(rs.getString("FKTABLE_NAME")).thenAnswer(inv -> rows[index[0] - 1][0]);
        when(rs.getString("FKCOLUMN_NAME")).thenAnswer(inv -> rows[index[0] - 1][1]);
        when(rs.getString("PKTABLE_NAME")).thenAnswer(inv -> rows[index[0] - 1][2]);
        when(rs.getString("PKCOLUMN_NAME")).thenAnswer(inv -> rows[index[0] - 1][3]);
        return rs;
    }

    private static String[] row(String fkTable, String fkColumn, String pkTable, String pkColumn) {
        return new String[]{fkTable, fkColumn, pkTable, pkColumn};
    }
}
