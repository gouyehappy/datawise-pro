package org.apache.datawise.backend.schema.spi;

import org.apache.datawise.backend.domain.PaginatedTreeNodes;
import org.apache.datawise.backend.domain.TreeNode;

import java.sql.Connection;
import java.sql.SQLException;
import java.util.List;

/**
 * Optional per-connector Explorer view metadata listing.
 * <p>Prefer {@link #listViews(ExplorerListRequest)} / {@link #listViewsPage(ExplorerPageRequest)}
 * at call sites. Implementations typically override the long-parameter methods.
 */
public interface JdbcSchemaViewLister {

    boolean supports(String dbType);

    /** Lower value wins when multiple listers match. */
    default int priority() {
        return 100;
    }

    List<TreeNode> listViews(
                             Connection connection,
                             String connectionId,
                             String catalog,
                             String schema,
                             String dbType) throws SQLException;

    /**
     * Canonical list entry. Default unpacks to the long-parameter overload.
     */
    default List<TreeNode> listViews(ExplorerListRequest request) throws SQLException {
        return listViews(
                request.connection(),
                request.connectionId(),
                request.catalog(),
                request.schema(),
                request.dbType());
    }

    /**
     * Paged view listing. Default loads the full list then slices in memory;
     * dialects should override with SQL {@code LIMIT}/{@code FETCH} when possible.
     */
    default PaginatedTreeNodes listViewsPage(
                                             Connection connection,
                                             String connectionId,
                                             String catalog,
                                             String schema,
                                             String dbType,
                                             int offset,
                                             int limit,
                                             String namePattern) throws SQLException {
        List<TreeNode> all = listViews(connection, connectionId, catalog, schema, dbType);
        return ExplorerListings.sliceFullList(all, offset, limit, namePattern);
    }

    /**
     * Canonical page entry. Default unpacks to the long-parameter overload.
     */
    default PaginatedTreeNodes listViewsPage(ExplorerPageRequest request) throws SQLException {
        return listViewsPage(
                request.connection(),
                request.connectionId(),
                request.catalog(),
                request.schema(),
                request.dbType(),
                request.offset(),
                request.limit(),
                request.namePattern());
    }

    /** @deprecated use {@link ExplorerListings#filterByLabelPattern(List, String)} */
    @Deprecated
    static List<TreeNode> filterByLabelPattern(List<TreeNode> nodes, String namePattern) {
        return ExplorerListings.filterByLabelPattern(nodes, namePattern);
    }
}
