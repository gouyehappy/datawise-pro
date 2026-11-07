package org.apache.datawise.backend.schema.introspect;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.connector.ConnectorPluginContributionHolder;
import org.apache.datawise.backend.domain.TreeNode;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.apache.datawise.backend.schema.GenericSchemaDialect;
import org.apache.datawise.backend.schema.SchemaDialect;
import org.apache.datawise.backend.schema.SchemaDialectRegistry;
import org.apache.datawise.backend.schema.JdbcSchemaExplorerRegistry;
import org.apache.datawise.backend.schema.SchemaScope;
import org.junit.jupiter.api.Test;

import java.sql.Connection;
import java.sql.DatabaseMetaData;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.List;
import java.util.Locale;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class JdbcSchemaIntrospectorTrinoTest {

    @Test
    void loadDatabaseChildren_listsSchemasUnderCatalog() throws SQLException {
        Connection connection = mock(Connection.class);
        DatabaseMetaData meta = mock(DatabaseMetaData.class);
        ResultSet rs = mock(ResultSet.class);
        when(connection.getMetaData()).thenReturn(meta);
        when(meta.getSchemas("hive", null)).thenReturn(rs);
        when(rs.next()).thenReturn(true, true, false);
        when(rs.getString("TABLE_SCHEM")).thenReturn("default", "analytics");

        ConnectionEntity entity = new ConnectionEntity();
        entity.setId("conn-1");
        entity.setDbType("trino");

        JdbcSchemaIntrospector introspector = new JdbcSchemaIntrospector(
                new SchemaDialectRegistry(
                        List.of(new FakeTrinoDialect()),
                        new GenericSchemaDialect(),
                        new ConnectorPluginContributionHolder()),
                null,
                emptyExplorerRegistry(),
                null,
                null);

        List<TreeNode> schemas = introspector.loadDatabaseChildren(connection, entity, "hive");

        assertEquals(2, schemas.size());
        assertEquals("schema", schemas.get(0).getType());
        assertEquals("default", schemas.get(0).getLabel());
        assertEquals("analytics", schemas.get(1).getLabel());
    }

    @Test
    void loadSchemaChildren_buildsTablesFolder() {
        ConnectionEntity entity = new ConnectionEntity();
        entity.setId("conn-1");
        entity.setDbType("trino");

        JdbcSchemaIntrospector introspector = new JdbcSchemaIntrospector(null, null, emptyExplorerRegistry(), null, null);
        List<TreeNode> children = introspector.loadSchemaChildren(
                mock(Connection.class),
                entity,
                "hive",
                "default");

        assertTrue(children.stream().anyMatch(
                node -> "folder".equals(node.getType()) && "tables".equals(node.getLabel())));
    }

    @Test
    void loadIndexChildren_returnsEmptyForTrino() throws SQLException {
        ConnectionEntity entity = new ConnectionEntity();
        entity.setId("conn-1");
        entity.setDbType("trino");

        JdbcSchemaIntrospector introspector = new JdbcSchemaIntrospector(null, null, emptyExplorerRegistry(), null, null);
        List<TreeNode> indexes = introspector.loadIndexChildren(
                mock(Connection.class),
                entity,
                "hive",
                "a003",
                "agent_test3");

        assertTrue(indexes.isEmpty());
    }

    private static JdbcSchemaExplorerRegistry emptyExplorerRegistry() {
        return new JdbcSchemaExplorerRegistry(List.of(), new ConnectorPluginContributionHolder());
    }

    private static final class FakeTrinoDialect implements SchemaDialect {

        @Override
        public String id() {
            return DbType.TRINO.id();
        }

        @Override
        public boolean supports(String dbType) {
            return DbType.isCatalogSchemaFamily(dbType);
        }

        @Override
        public boolean usesCatalogSchemaHierarchy() {
            return true;
        }

        @Override
        public SchemaScope resolveScope(Connection connection, String catalogLabel) throws SQLException {
            return new SchemaScope(catalogLabel, "%", catalogLabel);
        }

        @Override
        public boolean isSystemSchema(String schema) {
            return schema != null && "information_schema".equalsIgnoreCase(schema);
        }
    }
}
