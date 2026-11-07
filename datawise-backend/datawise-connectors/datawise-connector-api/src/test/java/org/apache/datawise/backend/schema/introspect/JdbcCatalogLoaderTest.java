package org.apache.datawise.backend.schema.introspect;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.connector.ConnectorPluginContributionHolder;
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
import java.util.List;
import java.util.Locale;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class JdbcCatalogLoaderTest {

    @Test
    void introspectCatalogBased_excludesDialectSystemCatalogs() throws SQLException {
        Connection connection = mock(Connection.class);
        DatabaseMetaData meta = mock(DatabaseMetaData.class);
        ResultSet catalogs = mock(ResultSet.class);
        when(connection.getMetaData()).thenReturn(meta);
        when(meta.getCatalogs()).thenReturn(catalogs);
        when(catalogs.next()).thenReturn(true, true, true, true, true, false);
        when(catalogs.getString("TABLE_CAT")).thenReturn("master", "tempdb", "model", "msdb", "Contoso");

        SchemaDialectRegistry registry = new SchemaDialectRegistry(
                List.of(new FakeSqlServerDialect()),
                new GenericSchemaDialect(),
                new ConnectorPluginContributionHolder());
        JdbcCatalogLoader loader = new JdbcCatalogLoader(registry, new SchemaTreeBuilder(), emptyExplorerRegistry());

        var databases = loader.introspect(connection, "conn-1", "sqlserver");

        assertEquals(1, databases.size());
        assertEquals("Contoso", databases.get(0).getLabel());
    }

    @Test
    void introspectSchemaRoots_listsAccessibleSchemasForOracle() throws SQLException {
        Connection connection = mock(Connection.class);
        DatabaseMetaData meta = mock(DatabaseMetaData.class);
        ResultSet schemas = mock(ResultSet.class);
        when(connection.getMetaData()).thenReturn(meta);
        when(meta.getSchemas()).thenReturn(schemas);
        when(schemas.next()).thenReturn(true, true, true, false);
        when(schemas.getString("TABLE_SCHEM")).thenReturn("HR", "SYS", "SCOTT");

        SchemaDialectRegistry registry = new SchemaDialectRegistry(
                List.of(new FakeOracleDialect()),
                new GenericSchemaDialect(),
                new ConnectorPluginContributionHolder());
        JdbcCatalogLoader loader = new JdbcCatalogLoader(registry, new SchemaTreeBuilder(), emptyExplorerRegistry());

        var databases = loader.introspect(connection, "conn-1", "oracle");

        assertEquals(2, databases.size());
        assertEquals("HR", databases.get(0).getLabel());
        assertEquals("SCOTT", databases.get(1).getLabel());
        assertEquals("database", databases.get(0).getType());
    }

    @Test
    void introspectCatalogBased_sqlServerCatalogLeavesChildrenEmptyForLazySchemaLoad() throws SQLException {
        Connection connection = mock(Connection.class);
        DatabaseMetaData meta = mock(DatabaseMetaData.class);
        ResultSet catalogs = mock(ResultSet.class);
        when(connection.getMetaData()).thenReturn(meta);
        when(meta.getCatalogs()).thenReturn(catalogs);
        when(catalogs.next()).thenReturn(true, false);
        when(catalogs.getString("TABLE_CAT")).thenReturn("mydb");

        SchemaDialectRegistry registry = new SchemaDialectRegistry(
                List.of(new FakeSqlServerDialect()),
                new GenericSchemaDialect(),
                new ConnectorPluginContributionHolder());
        JdbcCatalogLoader loader = new JdbcCatalogLoader(registry, new SchemaTreeBuilder(), emptyExplorerRegistry());

        var databases = loader.introspect(connection, "conn-1", "sqlserver");

        assertEquals(1, databases.size());
        assertEquals("mydb", databases.get(0).getLabel());
        assertEquals(0, databases.get(0).getChildren().size());
    }

    @Test
    void introspectCatalogBased_trinoCatalogLeavesChildrenEmptyForLazySchemaLoad() throws SQLException {
        Connection connection = mock(Connection.class);
        DatabaseMetaData meta = mock(DatabaseMetaData.class);
        ResultSet catalogs = mock(ResultSet.class);
        when(connection.getMetaData()).thenReturn(meta);
        when(meta.getCatalogs()).thenReturn(catalogs);
        when(catalogs.next()).thenReturn(true, false);
        when(catalogs.getString("TABLE_CAT")).thenReturn("hive");

        SchemaDialectRegistry registry = new SchemaDialectRegistry(
                List.of(new FakeTrinoDialect()),
                new GenericSchemaDialect(),
                new ConnectorPluginContributionHolder());
        JdbcCatalogLoader loader = new JdbcCatalogLoader(registry, new SchemaTreeBuilder(), emptyExplorerRegistry());

        var databases = loader.introspect(connection, "conn-1", "trino");

        assertEquals(1, databases.size());
        assertEquals("hive", databases.get(0).getLabel());
        assertEquals(0, databases.get(0).getChildren().size());
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
        public SchemaScope resolveScope(Connection connection, String catalogLabel) {
            return new SchemaScope(catalogLabel, "%", catalogLabel);
        }

        @Override
        public boolean isSystemCatalog(String catalog) {
            return "system".equalsIgnoreCase(catalog);
        }
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
        public SchemaScope resolveScope(Connection connection, String catalogLabel) {
            return new SchemaScope(catalogLabel, "dbo", catalogLabel);
        }

        @Override
        public boolean isSystemCatalog(String catalog) {
            return catalog != null && SYSTEM_CATALOGS.contains(catalog.toLowerCase(Locale.ROOT));
        }
    }

    private static final class FakeOracleDialect implements SchemaDialect {

        private static final Set<String> SYSTEM_SCHEMAS = Set.of("SYS", "SYSTEM");

        @Override
        public String id() {
            return DbType.ORACLE.id();
        }

        @Override
        public boolean supports(String dbType) {
            return DbType.isSchemaRootFamily(dbType);
        }

        @Override
        public SchemaScope resolveScope(Connection connection, String catalogLabel) {
            return new SchemaScope(null, catalogLabel, catalogLabel);
        }

        @Override
        public boolean isSystemSchema(String schema) {
            return schema != null && SYSTEM_SCHEMAS.contains(schema.toUpperCase(Locale.ROOT));
        }
    }
}
