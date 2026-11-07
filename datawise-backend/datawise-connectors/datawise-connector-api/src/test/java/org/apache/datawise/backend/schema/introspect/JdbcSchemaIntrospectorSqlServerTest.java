package org.apache.datawise.backend.schema.introspect;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.connector.ConnectorPluginContributionHolder;
import org.apache.datawise.backend.domain.TreeNode;
import org.apache.datawise.backend.jdbc.support.SqlServerCatalogSupport;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.apache.datawise.backend.schema.GenericSchemaDialect;
import org.apache.datawise.backend.schema.JdbcSchemaExplorerRegistry;
import org.apache.datawise.backend.schema.SchemaDialect;
import org.apache.datawise.backend.schema.SchemaDialectRegistry;
import org.apache.datawise.backend.schema.SchemaScope;
import org.junit.jupiter.api.Test;

import java.sql.Connection;
import java.sql.DatabaseMetaData;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.List;
import java.util.Locale;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class JdbcSchemaIntrospectorSqlServerTest {

    @Test
    void loadDatabaseChildren_listsSchemasUnderCatalog() throws SQLException {
        Connection connection = mock(Connection.class);
        Statement statement = mock(Statement.class);
        ResultSet rs = mock(ResultSet.class);
        when(connection.createStatement()).thenReturn(statement);
        when(statement.executeQuery(org.mockito.ArgumentMatchers.contains("sys.schemas"))).thenReturn(rs);
        when(rs.next()).thenReturn(true, true, false);
        when(rs.getString(1)).thenReturn("dbo", "sales");

        ConnectionEntity entity = new ConnectionEntity();
        entity.setId("conn-1");
        entity.setDbType("sqlserver");

        JdbcSchemaIntrospector introspector = new JdbcSchemaIntrospector(
                new SchemaDialectRegistry(
                        List.of(new FakeSqlServerDialect()),
                        new GenericSchemaDialect(),
                        new ConnectorPluginContributionHolder()),
                null,
                emptyExplorerRegistry(),
                null,
                null);

        List<TreeNode> schemas = introspector.loadDatabaseChildren(connection, entity, "mydb");

        assertEquals(2, schemas.size());
        assertEquals("schema", schemas.get(0).getType());
        assertEquals("dbo", schemas.get(0).getLabel());
        assertEquals("sales", schemas.get(1).getLabel());
        verify(statement).execute("USE [mydb]");
    }

    @Test
    void loadDatabaseChildren_filtersSqlServerSystemSchemas() throws SQLException {
        Connection connection = mock(Connection.class);
        Statement statement = mock(Statement.class);
        ResultSet rs = mock(ResultSet.class);
        when(connection.createStatement()).thenReturn(statement);
        when(statement.executeQuery(org.mockito.ArgumentMatchers.contains("sys.schemas"))).thenReturn(rs);
        when(rs.next()).thenReturn(true, true, true, false);
        when(rs.getString(1)).thenReturn("db_accessadmin", "dbo", "sales");

        ConnectionEntity entity = new ConnectionEntity();
        entity.setId("conn-1");
        entity.setDbType("sqlserver");

        JdbcSchemaIntrospector introspector = new JdbcSchemaIntrospector(
                new SchemaDialectRegistry(
                        List.of(new GenericSchemaDialect()),
                        new GenericSchemaDialect(),
                        new ConnectorPluginContributionHolder()),
                null,
                emptyExplorerRegistry(),
                null,
                null);

        List<TreeNode> schemas = introspector.loadDatabaseChildren(connection, entity, "mydb");

        assertEquals(2, schemas.size());
        assertEquals("dbo", schemas.get(0).getLabel());
        assertEquals("sales", schemas.get(1).getLabel());
    }

    @Test
    void loadDatabaseChildren_listsSchemasWhenDialectFallsBackToGeneric() throws SQLException {
        Connection connection = mock(Connection.class);
        Statement statement = mock(Statement.class);
        ResultSet rs = mock(ResultSet.class);
        when(connection.createStatement()).thenReturn(statement);
        when(statement.executeQuery(org.mockito.ArgumentMatchers.contains("sys.schemas"))).thenReturn(rs);
        when(rs.next()).thenReturn(true, false);
        when(rs.getString(1)).thenReturn("dbo");

        ConnectionEntity entity = new ConnectionEntity();
        entity.setId("conn-1");
        entity.setDbType("sqlserver");

        JdbcSchemaIntrospector introspector = new JdbcSchemaIntrospector(
                new SchemaDialectRegistry(
                        List.of(new GenericSchemaDialect()),
                        new GenericSchemaDialect(),
                        new ConnectorPluginContributionHolder()),
                null,
                emptyExplorerRegistry(),
                null,
                null);

        List<TreeNode> schemas = introspector.loadDatabaseChildren(connection, entity, "mydb");

        assertEquals(1, schemas.size());
        assertEquals("schema", schemas.get(0).getType());
        assertEquals("dbo", schemas.get(0).getLabel());
    }

    @Test
    void loadSchemaChildren_buildsTablesFolder() {
        ConnectionEntity entity = new ConnectionEntity();
        entity.setId("conn-1");
        entity.setDbType("sqlserver");

        JdbcSchemaIntrospector introspector = new JdbcSchemaIntrospector(null, null, emptyExplorerRegistry(), null, null);
        List<TreeNode> children = introspector.loadSchemaChildren(
                mock(Connection.class),
                entity,
                "mydb",
                "dbo");

        assertTrue(children.stream().anyMatch(
                node -> "folder".equals(node.getType()) && "tables".equals(node.getLabel())));
        for (String folder : List.of("views", "functions", "procedures", "triggers")) {
            assertTrue(children.stream().anyMatch(
                    node -> "folder".equals(node.getType()) && folder.equals(node.getLabel())), () -> "missing folder: " + folder);
        }
    }

    private static JdbcSchemaExplorerRegistry emptyExplorerRegistry() {
        return new JdbcSchemaExplorerRegistry(List.of(), new ConnectorPluginContributionHolder());
    }

    private static final class FakeSqlServerDialect implements SchemaDialect {

        private static final Set<String> SYSTEM_CATALOGS = Set.of("master", "tempdb", "model", "msdb");

        @Override
        public String id() {
            return DbType.SQLSERVER.id();
        }

        @Override
        public boolean supports(String dbType) {
            return DbType.isSqlServerFamily(dbType);
        }

        @Override
        public boolean usesCatalogSchemaHierarchy() {
            return true;
        }

        @Override
        public void prepareCatalogConnection(Connection connection, String catalog) throws SQLException {
            try (Statement statement = connection.createStatement()) {
                statement.execute("USE [" + catalog + "]");
            }
        }

        @Override
        public SchemaScope resolveScope(Connection connection, String catalogLabel) {
            return new SchemaScope(catalogLabel, "%", catalogLabel);
        }

        @Override
        public boolean isSystemCatalog(String catalog) {
            return catalog != null && SYSTEM_CATALOGS.contains(catalog.toLowerCase(Locale.ROOT));
        }

        @Override
        public boolean isSystemSchema(String schema) {
            return SqlServerCatalogSupport.isSystemSchema(schema);
        }
    }
}
