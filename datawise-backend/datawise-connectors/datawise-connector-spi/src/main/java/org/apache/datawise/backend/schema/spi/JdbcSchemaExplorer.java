package org.apache.datawise.backend.schema.spi;

import org.apache.datawise.backend.domain.PaginatedTreeNodes;
import org.apache.datawise.backend.domain.TableColumnDetail;
import org.apache.datawise.backend.domain.TreeNode;

import java.sql.Connection;
import java.sql.SQLException;
import java.util.List;

/**
 * Optional JDBC Explorer overrides for connectors whose catalog/table/column metadata
 * does not fit the generic {@code DatabaseMetaData} paths (e.g. Apache Hive).
 * <p>Prefer Request-based page APIs; long-parameter methods remain for existing callers.
 */
public interface JdbcSchemaExplorer {

    boolean supports(String dbType);

    /** Lower value wins when multiple explorers match. */
    default int priority() {
        return 100;
    }

    /** When true, Explorer tree is catalog → schema → objects. */
    default boolean supportsCatalogSchemaHierarchy() {
        return false;
    }

    List<TreeNode> introspectConnection(Connection connection, String connectionId) throws SQLException;

    List<TreeNode> loadDatabaseChildren(Connection connection, String connectionId, String catalog) throws SQLException;

    List<TreeNode> listTables(
                              Connection connection,
                              String connectionId,
                              String catalog,
                              String schema,
                              boolean skeleton) throws SQLException;

    default PaginatedTreeNodes listTablesPage(ExplorerPageRequest request) throws SQLException {
        List<TreeNode> all = listTables(
                request.connection(),
                request.connectionId(),
                request.catalog(),
                request.schema(),
                request.skeleton());
        return ExplorerListings.sliceFullList(all, request.offset(), request.limit(), request.namePattern());
    }

    /** Optional view override; default empty (generic view listers apply). */
    default List<TreeNode> listViews(ExplorerListRequest request) throws SQLException {
        return List.of();
    }

    default PaginatedTreeNodes listViewsPage(ExplorerPageRequest request) throws SQLException {
        return ExplorerListings.sliceFullList(
                listViews(request.toListRequest()),
                request.offset(),
                request.limit(),
                request.namePattern());
    }

    List<TableColumnDetail> loadColumns(Connection connection, String database, String tableName) throws SQLException;

    String quoteQualifiedTable(String database, String tableName);
}
