package org.apache.datawise.backend.connector.hive.explorer;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.connector.hive.schema.HiveSchemaDialect;
import org.apache.datawise.backend.connector.hive.support.HiveMetadataSupport;
import org.apache.datawise.backend.connector.hive.support.HiveMetadataSupport.HiveTableScope;
import org.apache.datawise.backend.domain.TableColumnDetail;
import org.apache.datawise.backend.domain.TreeNode;
import org.apache.datawise.backend.schema.SchemaDialect;
import org.apache.datawise.backend.schema.SchemaNodeIds;
import org.apache.datawise.backend.schema.SchemaScope;
import org.apache.datawise.backend.schema.introspect.SchemaTreeBuilder;
import org.apache.datawise.backend.schema.spi.JdbcSchemaExplorer;

import java.sql.Connection;
import java.sql.DatabaseMetaData;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/** Apache Hive Explorer: flat databases or catalog → schema, JDBC metadata + SHOW/DESCRIBE fallbacks. */
public final class HiveSchemaExplorer implements JdbcSchemaExplorer {

    private final HiveSchemaDialect dialect = new HiveSchemaDialect();
    private final SchemaTreeBuilder treeBuilder = new SchemaTreeBuilder();

    @Override
    public boolean supports(String dbType) {
        return DbType.HIVE.id().equals(DbType.normalizeId(dbType));
    }

    @Override
    public int priority() {
        return 13;
    }

    @Override
    public List<TreeNode> introspectConnection(Connection connection, String connectionId) throws SQLException {
        List<String> catalogs = loadCatalogNames(connection);
        if (!catalogs.isEmpty()) {
            List<TreeNode> nodes = new ArrayList<>(catalogs.size());
            for (String catalog : catalogs) {
                nodes.add(treeBuilder.buildCatalogNode(connectionId, catalog));
            }
            return nodes;
        }
        return listDatabaseNodes(connection, connectionId);
    }

    @Override
    public List<TreeNode> loadDatabaseChildren(Connection connection, String connectionId, String catalog)
            throws SQLException {
        if (HiveMetadataSupport.hasRealCatalogs(connection)) {
            return listSchemasInCatalog(connection, connectionId, catalog);
        }
        return treeBuilder.buildDatabaseChildren(connectionId, catalog, List.of());
    }

    @Override
    public List<TreeNode> listTables(
            Connection connection,
            String connectionId,
            String catalog,
            String schema,
            boolean skeleton
    ) throws SQLException {
        HiveTableScope scope = schema != null && !schema.isBlank()
                ? new HiveTableScope(catalog, schema)
                : new HiveTableScope(null, catalog);
        HiveMetadataSupport.applyScope(connection, scope);
        Set<String> seen = new LinkedHashSet<>();
        List<TreeNode> tables = new ArrayList<>();
        SchemaScope filterScope = schema != null && !schema.isBlank()
                ? new SchemaScope(catalog, schema, catalog + "." + schema)
                : new SchemaScope(catalog, "%", catalog);
        for (String[] probe : tableMetadataProbes(catalog, schema, scope)) {
            appendMetadataTables(
                    connection.getMetaData(),
                    probe[0],
                    probe[1],
                    filterScope,
                    connectionId,
                    catalog,
                    schema,
                    skeleton,
                    seen,
                    tables
            );
            if (!tables.isEmpty()) {
                return tables;
            }
        }
        appendShowTables(connection, connectionId, catalog, schema, skeleton, seen, tables);
        return tables;
    }

    @Override
    public List<TableColumnDetail> loadColumns(Connection connection, String database, String tableName)
            throws SQLException {
        return HiveMetadataSupport.loadColumns(connection, database, tableName);
    }

    @Override
    public String quoteQualifiedTable(String database, String tableName) {
        return HiveMetadataSupport.quoteQualifiedTable(database, tableName);
    }

    private List<String> loadCatalogNames(Connection connection) throws SQLException {
        List<String> catalogs = new ArrayList<>();
        try (ResultSet rs = connection.getMetaData().getCatalogs()) {
            while (rs.next()) {
                String catalog = rs.getString("TABLE_CAT");
                if (catalog == null || catalog.isBlank() || dialect.isSystemCatalog(catalog)) {
                    continue;
                }
                catalogs.add(catalog);
            }
        }
        return catalogs;
    }

    private List<TreeNode> listDatabaseNodes(Connection connection, String connectionId) throws SQLException {
        LinkedHashSet<String> databases = new LinkedHashSet<>();
        try (ResultSet rs = connection.getMetaData().getSchemas(null, null)) {
            while (rs.next()) {
                String database = rs.getString("TABLE_SCHEM");
                if (database == null || database.isBlank() || dialect.isSystemSchema(database)) {
                    continue;
                }
                databases.add(database);
            }
        }
        if (databases.isEmpty()) {
            databases.addAll(listDatabasesViaShow(connection));
        }
        List<TreeNode> nodes = new ArrayList<>(databases.size());
        for (String database : databases) {
            nodes.add(treeBuilder.buildDatabaseNode(connectionId, database, List.of()));
        }
        return nodes;
    }

    private LinkedHashSet<String> listDatabasesViaShow(Connection connection) throws SQLException {
        LinkedHashSet<String> databases = new LinkedHashSet<>();
        try (Statement statement = connection.createStatement();
             ResultSet rs = statement.executeQuery("SHOW DATABASES")) {
            while (rs.next()) {
                String database = rs.getString(1);
                if (database == null || database.isBlank() || dialect.isSystemSchema(database)) {
                    continue;
                }
                databases.add(database);
            }
        } catch (SQLException ex) {
            // HS2 may restrict SHOW DATABASES.
        }
        return databases;
    }

    private List<TreeNode> listSchemasInCatalog(Connection connection, String connectionId, String catalog)
            throws SQLException {
        List<TreeNode> schemas = new ArrayList<>();
        try (ResultSet rs = connection.getMetaData().getSchemas(catalog, null)) {
            while (rs.next()) {
                String schema = rs.getString("TABLE_SCHEM");
                if (schema == null || schema.isBlank() || dialect.isSystemSchema(schema)) {
                    continue;
                }
                schemas.add(treeBuilder.buildSchemaNode(connectionId, catalog, schema));
            }
        }
        if (schemas.isEmpty()) {
            String fallback = connection.getSchema();
            if (fallback == null || fallback.isBlank()) {
                fallback = "default";
            }
            schemas.add(treeBuilder.buildSchemaNode(connectionId, catalog, fallback));
        }
        return schemas;
    }

    private static String[][] tableMetadataProbes(String catalog, String schema, HiveTableScope scope) {
        if (schema != null && !schema.isBlank()) {
            return new String[][]{
                    {null, schema.trim()},
                    {catalog, schema.trim()},
                    {null, scope.database()},
                    {scope.catalog(), scope.database()},
            };
        }
        if (catalog != null && !catalog.isBlank()) {
            return new String[][]{
                    {null, catalog.trim()},
                    {null, scope.database()},
                    {catalog.trim(), "%"},
                    {catalog.trim(), null},
            };
        }
        return new String[][]{{null, "%"}};
    }

    private void appendMetadataTables(
            DatabaseMetaData meta,
            String catalogPattern,
            String schemaPattern,
            SchemaScope filterScope,
            String connectionId,
            String catalog,
            String schema,
            boolean skeleton,
            Set<String> seen,
            List<TreeNode> tables
    ) throws SQLException {
        try (ResultSet rs = meta.getTables(
                catalogPattern,
                schemaPattern,
                "%",
                HiveMetadataSupport.jdbcTableTypes()
        )) {
            while (rs.next()) {
                String tableName = rs.getString("TABLE_NAME");
                if (tableName == null || tableName.isBlank() || !seen.add(tableName)) {
                    continue;
                }
                String tableCatalog = rs.getString("TABLE_CAT");
                String tableSchema = rs.getString("TABLE_SCHEM");
                if (!matchesTableScope(filterScope, tableCatalog, tableSchema)) {
                    continue;
                }
                tables.add(toTableNode(connectionId, catalog, schema, tableName, rs.getString("REMARKS"), skeleton));
            }
        }
    }

    private void appendShowTables(
            Connection connection,
            String connectionId,
            String catalog,
            String schema,
            boolean skeleton,
            Set<String> seen,
            List<TreeNode> tables
    ) throws SQLException {
        for (String namespace : showTablesNamespaces(catalog, schema)) {
            String sql = "SHOW TABLES IN " + namespace;
            try (Statement statement = connection.createStatement();
                 ResultSet rs = statement.executeQuery(sql)) {
                while (rs.next()) {
                    String tableName = rs.getString("tab_name");
                    if (tableName == null || tableName.isBlank()) {
                        tableName = rs.getString(1);
                    }
                    if (tableName == null || tableName.isBlank() || !seen.add(tableName)) {
                        continue;
                    }
                    tables.add(toTableNode(connectionId, catalog, schema, tableName, null, skeleton));
                }
                if (!tables.isEmpty()) {
                    return;
                }
            } catch (SQLException ex) {
                // Try the next namespace variant.
            }
        }
    }

    private static List<String> showTablesNamespaces(String catalog, String schema) {
        List<String> namespaces = new ArrayList<>(2);
        if (schema != null && !schema.isBlank()) {
            namespaces.add(schema.trim());
            if (catalog != null && !catalog.isBlank()
                    && !HiveMetadataSupport.SYNTHETIC_CATALOG_FALLBACK.equalsIgnoreCase(catalog.trim())) {
                namespaces.add(catalog.trim() + "." + schema.trim());
            }
        } else if (catalog != null && !catalog.isBlank()) {
            namespaces.add(catalog.trim());
        }
        return namespaces;
    }

    private static boolean matchesTableScope(SchemaScope scope, String tableCatalog, String tableSchema) {
        String expectedSchema = scope.schemaPattern();
        if (expectedSchema != null && !expectedSchema.isBlank() && !"%".equals(expectedSchema)) {
            if (tableSchema != null && expectedSchema.equalsIgnoreCase(tableSchema)) {
                return true;
            }
            if ((tableSchema == null || tableSchema.isBlank()) && tableCatalog != null
                    && expectedSchema.equalsIgnoreCase(tableCatalog)) {
                return true;
            }
        }
        String expectedCatalog = scope.catalogPattern();
        if (expectedCatalog != null && !expectedCatalog.isBlank() && !"%".equals(expectedCatalog)
                && (expectedSchema == null || expectedSchema.isBlank() || "%".equals(expectedSchema))) {
            if (tableCatalog != null && expectedCatalog.equalsIgnoreCase(tableCatalog)) {
                return true;
            }
            if (tableSchema != null && expectedCatalog.equalsIgnoreCase(tableSchema)) {
                return true;
            }
        }
        if (scope.schemaPattern() != null && !scope.schemaPattern().isBlank()) {
            String expected = scope.schemaPattern();
            if (!"%".equals(expected)
                    && (tableSchema == null || !tableSchema.equalsIgnoreCase(expected))) {
                return false;
            }
        }
        if (scope.catalogPattern() != null && !scope.catalogPattern().isBlank()) {
            String expected = scope.catalogPattern();
            if (!"%".equals(expected)
                    && tableCatalog != null
                    && !tableCatalog.equalsIgnoreCase(expected)) {
                return false;
            }
        }
        return true;
    }

    private TreeNode toTableNode(
            String connectionId,
            String catalog,
            String schema,
            String tableName,
            String comment,
            boolean skeleton
    ) {
        TreeNode table = new TreeNode();
        table.setId(tableNodeId(connectionId, catalog, schema, tableName));
        table.setLabel(tableName);
        table.setType("table");
        if (comment != null && !comment.isBlank()) {
            table.setComment(comment);
        }
        table.setExpanded(false);
        if (!skeleton) {
            if (schema != null && !schema.isBlank()) {
                table.setChildren(treeBuilder.buildTableSkeleton(connectionId, catalog, schema, tableName));
            } else {
                table.setChildren(treeBuilder.buildTableSkeleton(connectionId, catalog, tableName));
            }
        } else {
            table.setChildren(List.of());
        }
        return table;
    }

    private static String tableNodeId(String connectionId, String catalog, String schema, String tableName) {
        if (schema != null && !schema.isBlank()) {
            return SchemaNodeIds.nodeId("table", connectionId, catalog, schema, tableName);
        }
        return SchemaNodeIds.nodeId("table", connectionId, catalog, tableName);
    }
}
