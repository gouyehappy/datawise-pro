package org.apache.datawise.backend.schema.introspect;

import org.apache.datawise.backend.domain.PaginatedTreeNodes;
import org.apache.datawise.backend.domain.TreeNode;
import org.apache.datawise.backend.schema.JdbcSchemaExplorerRegistry;
import org.apache.datawise.backend.schema.SchemaDialectRegistry;
import org.apache.datawise.backend.schema.introspect.listing.JdbcDialectTableLister;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.sql.Connection;
import java.sql.SQLException;
import java.util.List;

/** Lists JDBC tables for a catalog/schema scope (fast dialect SQL with metadata fallback). */
public final class JdbcTableLister {

    private static final Logger log = LoggerFactory.getLogger(JdbcTableLister.class);

    private final JdbcDialectTableLister dialectTableLister;

    public JdbcTableLister(JdbcDialectTableLister dialectTableLister) {
        this.dialectTableLister = dialectTableLister;
    }

    /** Test / non-Spring path: builds dialect lister with builtin fast table strategies. */
    public JdbcTableLister(
                           SchemaDialectRegistry dialectRegistry,
                           SchemaTreeBuilder treeBuilder,
                           JdbcSchemaExplorerRegistry explorerRegistry) {
        this.dialectTableLister = new JdbcDialectTableLister(dialectRegistry, treeBuilder, explorerRegistry);
    }

    public List<TreeNode> listTables(Connection connection, String connectionId, String catalog, String dbType) throws SQLException {
        return listTables(connection, connectionId, catalog, null, dbType, false);
    }

    public List<TreeNode> listTables(
                                     Connection connection,
                                     String connectionId,
                                     String catalog,
                                     String schema,
                                     String dbType) throws SQLException {
        return listTables(connection, connectionId, catalog, schema, dbType, false);
    }

    public List<TreeNode> listTables(
                                     Connection connection,
                                     String connectionId,
                                     String catalog,
                                     String schema,
                                     String dbType,
                                     boolean skeleton) throws SQLException {
        PaginatedTreeNodes page = listTablesPage(
                connection,
                connectionId,
                catalog,
                schema,
                dbType,
                0,
                Integer.MAX_VALUE,
                skeleton,
                null);
        return page.nodes();
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
        if (dialectTableLister.supportsFastListing(dbType)) {
            try {
                PaginatedTreeNodes page = dialectTableLister.listTablesPage(
                        connection,
                        connectionId,
                        catalog,
                        schema,
                        dbType,
                        offset,
                        limit,
                        skeleton,
                        namePattern);
                if (page != null) {
                    return page;
                }
            } catch (SQLException ex) {
                log.debug(
                        "Fast table listing failed for dbType={}; falling back to JDBC metadata",
                        dbType,
                        ex);
            }
        }
        // Collect one extra row past the page so slice can set hasMore without full scan.
        // Name patterns are pushed into DatabaseMetaData.getTables when possible.
        List<TreeNode> all = dialectTableLister.listTablesViaMetadata(
                connection,
                connectionId,
                catalog,
                schema,
                dbType,
                skeleton,
                Math.max(0, offset) + Math.max(1, limit) + 1,
                namePattern);
        return PaginatedTreeNodes.slice(all, offset, limit);
    }
}
