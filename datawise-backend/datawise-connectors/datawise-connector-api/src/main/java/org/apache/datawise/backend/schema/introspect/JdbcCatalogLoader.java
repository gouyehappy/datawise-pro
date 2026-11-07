package org.apache.datawise.backend.schema.introspect;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.domain.TreeNode;
import org.apache.datawise.backend.schema.JdbcSchemaExplorerRegistry;
import org.apache.datawise.backend.schema.SchemaDialect;
import org.apache.datawise.backend.schema.SchemaDialectRegistry;

import java.sql.Connection;
import java.sql.DatabaseMetaData;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/** Loads top-level database/schema nodes for JDBC connections. */
public final class JdbcCatalogLoader {

    private final SchemaDialectRegistry dialectRegistry;
    private final SchemaTreeBuilder treeBuilder;
    private final JdbcSchemaExplorerRegistry explorerRegistry;

    public JdbcCatalogLoader(
                             SchemaDialectRegistry dialectRegistry,
                             SchemaTreeBuilder treeBuilder,
                             JdbcSchemaExplorerRegistry explorerRegistry) {
        this.dialectRegistry = dialectRegistry;
        this.treeBuilder = treeBuilder;
        this.explorerRegistry = explorerRegistry;
    }

    public List<TreeNode> introspect(Connection connection, String connectionId, String dbType) throws SQLException {
        var explorer = explorerRegistry.find(dbType);
        if (explorer.isPresent()) {
            return explorer.get().introspectConnection(connection, connectionId);
        }
        return introspectDefault(connection, connectionId, dbType);
    }

    private List<TreeNode> introspectDefault(Connection connection, String connectionId, String dbType) throws SQLException {
        if (DbType.isPostgresqlFamily(dbType)) {
            return introspectPostgreSql(connection, connectionId);
        }
        if (DbType.isSchemaRootFamily(dbType)) {
            return introspectSchemaRoots(connection, connectionId, dbType);
        }
        return introspectCatalogBased(connection, connectionId, dbType);
    }

    private List<TreeNode> introspectCatalogBased(
                                                  Connection connection,
                                                  String connectionId,
                                                  String dbType) throws SQLException {
        DatabaseMetaData meta = connection.getMetaData();
        SchemaDialect dialect = dialectRegistry.resolve(dbType);
        List<TreeNode> databases = new ArrayList<>();
        try (ResultSet rs = meta.getCatalogs()) {
            while (rs.next()) {
                String catalog = rs.getString("TABLE_CAT");
                if (catalog == null || catalog.isBlank()) {
                    continue;
                }
                if (dialect.isSystemCatalog(catalog)) {
                    continue;
                }
                if (dialect.usesCatalogSchemaHierarchy()) {
                    databases.add(treeBuilder.buildCatalogNode(connectionId, catalog));
                } else {
                    databases.add(treeBuilder.buildDatabaseNode(connectionId, catalog, List.of()));
                }
            }
        }
        if (databases.isEmpty()) {
            String fallback = connection.getCatalog();
            if (fallback == null || fallback.isBlank()) {
                fallback = "main";
            }
            if (dialect.usesCatalogSchemaHierarchy()) {
                databases.add(treeBuilder.buildCatalogNode(connectionId, fallback));
            } else {
                databases.add(treeBuilder.buildDatabaseNode(connectionId, fallback, List.of()));
            }
        }
        return databases;
    }

    private List<TreeNode> introspectSchemaRoots(
                                                 Connection connection,
                                                 String connectionId,
                                                 String dbType) throws SQLException {
        DatabaseMetaData meta = connection.getMetaData();
        SchemaDialect dialect = dialectRegistry.resolve(dbType);
        Set<String> schemas = new LinkedHashSet<>();
        try (ResultSet rs = meta.getSchemas()) {
            while (rs.next()) {
                String schema = rs.getString("TABLE_SCHEM");
                if (schema == null || schema.isBlank()) {
                    continue;
                }
                if (dialect.isSystemSchema(schema)) {
                    continue;
                }
                schemas.add(schema);
            }
        }
        if (schemas.isEmpty()) {
            String fallback = connection.getSchema();
            if (fallback == null || fallback.isBlank()) {
                fallback = meta.getUserName();
            }
            if (fallback == null || fallback.isBlank()) {
                fallback = "default";
            }
            schemas.add(fallback);
        }
        List<TreeNode> databases = new ArrayList<>();
        for (String schema : schemas) {
            databases.add(treeBuilder.buildDatabaseNode(connectionId, schema, List.of()));
        }
        return databases;
    }

    private List<TreeNode> introspectPostgreSql(Connection connection, String connectionId) throws SQLException {
        DatabaseMetaData meta = connection.getMetaData();
        Set<String> schemas = new LinkedHashSet<>();
        try (ResultSet rs = meta.getSchemas()) {
            while (rs.next()) {
                String schema = rs.getString("TABLE_SCHEM");
                if (schema == null || schema.isBlank()) {
                    continue;
                }
                SchemaDialect dialect = dialectRegistry.resolve("postgresql");
                if (dialect.isSystemSchema(schema)) {
                    continue;
                }
                schemas.add(schema);
            }
        }
        if (schemas.isEmpty()) {
            schemas.add("public");
        }
        List<TreeNode> databases = new ArrayList<>();
        for (String schema : schemas) {
            databases.add(treeBuilder.buildDatabaseNode(connectionId, schema, List.of()));
        }
        return databases;
    }
}
