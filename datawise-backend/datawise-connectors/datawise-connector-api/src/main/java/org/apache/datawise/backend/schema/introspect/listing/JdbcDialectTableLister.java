package org.apache.datawise.backend.schema.introspect.listing;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.domain.PaginatedTreeNodes;
import org.apache.datawise.backend.domain.TreeNode;
import org.apache.datawise.backend.schema.JdbcSchemaExplorerRegistry;
import org.apache.datawise.backend.schema.SchemaDialect;
import org.apache.datawise.backend.schema.SchemaDialectRegistry;
import org.apache.datawise.backend.schema.SchemaScope;
import org.apache.datawise.backend.schema.introspect.ExplorerSchemaFilter;
import org.apache.datawise.backend.schema.introspect.JdbcNamePatternSupport;
import org.apache.datawise.backend.schema.introspect.JdbcSchemaListingScopes;
import org.apache.datawise.backend.schema.introspect.SchemaTreeBuilder;
import org.apache.datawise.backend.schema.spi.ExplorerPageRequest;
import org.apache.datawise.backend.schema.spi.FastTableLister;

import java.sql.Connection;
import java.sql.DatabaseMetaData;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * Fast table listing via information_schema / sys.tables / all_tables for JDBC families,
 * with offset/limit pagination and optional name pattern.
 */
public final class JdbcDialectTableLister {

    private final SchemaDialectRegistry dialectRegistry;
    private final JdbcSchemaExplorerRegistry explorerRegistry;
    private final JdbcTableListingSupport tableListingSupport;
    private final FastTableListingRegistry fastListingRegistry;

    public JdbcDialectTableLister(
                                  SchemaDialectRegistry dialectRegistry,
                                  JdbcSchemaExplorerRegistry explorerRegistry,
                                  JdbcTableListingSupport tableListingSupport,
                                  FastTableListingRegistry fastListingRegistry) {
        this.dialectRegistry = dialectRegistry;
        this.explorerRegistry = explorerRegistry;
        this.tableListingSupport = tableListingSupport;
        this.fastListingRegistry = fastListingRegistry;
    }

    /** Test / non-Spring path: builds support + builtin fast listers. */
    public JdbcDialectTableLister(
                                  SchemaDialectRegistry dialectRegistry,
                                  SchemaTreeBuilder treeBuilder,
                                  JdbcSchemaExplorerRegistry explorerRegistry) {
        this.dialectRegistry = dialectRegistry;
        this.explorerRegistry = explorerRegistry;
        this.tableListingSupport = new JdbcTableListingSupport(treeBuilder);
        this.fastListingRegistry = FastTableListingRegistry.withBuiltins(this.tableListingSupport);
    }

    public boolean supportsFastListing(String dbType) {
        return fastListingRegistry.supportsFastListing(dbType);
    }

    public PaginatedTreeNodes listTablesPage(
                                             Connection connection,
                                             String connectionId,
                                             String catalog,
                                             String schema,
                                             String dbType,
                                             int offset,
                                             int limit,
                                             boolean skeleton,
                                             String namePattern) throws SQLException {
        SchemaScope scope = JdbcSchemaListingScopes.resolveScope(
                connection, catalog, schema, dbType, dialectRegistry);
        if (scope == null) {
            return PaginatedTreeNodes.empty();
        }
        SchemaDialect dialect = dialectRegistry.resolve(dbType);
        ExplorerPageRequest request = ExplorerPageRequest.of(
                connection,
                connectionId,
                catalog,
                schema,
                dbType,
                scope,
                dialect,
                offset,
                limit,
                skeleton,
                namePattern);
        return fastListingRegistry.listTablesPage(request, dbType);
    }

    public List<TreeNode> listTablesViaMetadata(
                                                Connection connection,
                                                String connectionId,
                                                String catalog,
                                                String schema,
                                                String dbType,
                                                boolean skeleton) throws SQLException {
        return listTablesViaMetadata(
                connection, connectionId, catalog, schema, dbType, skeleton, Integer.MAX_VALUE, null);
    }

    /**
     * @param maxNodes stop after collecting this many matching tables (for page early-stop); {@link Integer#MAX_VALUE} = all
     */
    public List<TreeNode> listTablesViaMetadata(
                                                Connection connection,
                                                String connectionId,
                                                String catalog,
                                                String schema,
                                                String dbType,
                                                boolean skeleton,
                                                int maxNodes) throws SQLException {
        return listTablesViaMetadata(
                connection, connectionId, catalog, schema, dbType, skeleton, maxNodes, null);
    }

    /**
     * @param maxNodes    stop after collecting this many matching tables (for page early-stop); {@link Integer#MAX_VALUE} = all
     * @param namePattern optional UI wildcard; when non-null, passed to {@link DatabaseMetaData#getTables} as JDBC pattern
     */
    public List<TreeNode> listTablesViaMetadata(
                                                Connection connection,
                                                String connectionId,
                                                String catalog,
                                                String schema,
                                                String dbType,
                                                boolean skeleton,
                                                int maxNodes,
                                                String namePattern) throws SQLException {
        int limit = maxNodes > 0 ? maxNodes : Integer.MAX_VALUE;
        String jdbcTableNamePattern = JdbcNamePatternSupport.toJdbcTableNamePattern(namePattern);
        var explorer = explorerRegistry.find(dbType);
        if (explorer.isPresent()) {
            List<TreeNode> all = explorer.get().listTables(connection, connectionId, catalog, schema, skeleton);
            if (JdbcNamePatternSupport.hasNamePattern(namePattern)) {
                all = JdbcNamePatternSupport.filterByLabelPattern(all, namePattern);
            }
            if (all.size() <= limit) {
                return all;
            }
            return List.copyOf(all.subList(0, limit));
        }
        SchemaScope scope = JdbcSchemaListingScopes.resolveScope(
                connection, catalog, schema, dbType, dialectRegistry);
        if (scope == null) {
            return List.of();
        }
        DatabaseMetaData meta = connection.getMetaData();
        List<TreeNode> tables = new ArrayList<>();
        try (
                ResultSet rs = meta.getTables(
                        scope.catalogPattern(),
                        scope.schemaPattern(),
                        jdbcTableNamePattern,
                        new String[]{"TABLE"})) {
            while (rs.next()) {
                if (tables.size() >= limit) {
                    break;
                }
                String tableName = rs.getString("TABLE_NAME");
                if (tableName == null || tableName.isBlank()) {
                    continue;
                }
                String tableType = rs.getString("TABLE_TYPE");
                if (tableType != null && tableType.toUpperCase(Locale.ROOT).contains("VIEW")) {
                    continue;
                }
                String tableCatalog = rs.getString("TABLE_CAT");
                String tableSchema = rs.getString("TABLE_SCHEM");
                if (!ExplorerSchemaFilter.matchesTableScope(scope, tableCatalog, tableSchema)) {
                    continue;
                }
                if (isOracleInternalTable(dbType, tableName)) {
                    continue;
                }
                tables.add(tableListingSupport.buildTableNode(
                        connectionId,
                        catalog,
                        schema,
                        tableName,
                        rs.getString("REMARKS"),
                        skeleton));
            }
        }
        return tables;
    }

    private static boolean isOracleInternalTable(String dbType, String tableName) {
        if (!DbType.ORACLE.matches(dbType)) {
            return false;
        }
        if (tableName == null || tableName.isBlank()) {
            return true;
        }
        String upper = tableName.trim().toUpperCase(Locale.ROOT);
        return upper.startsWith("SYS_IOT_OVER_") || upper.startsWith("BIN$");
    }
}
