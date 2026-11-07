package org.apache.datawise.backend.schema.spi;

import org.apache.datawise.backend.domain.PaginatedTreeNodes;
import org.apache.datawise.backend.domain.TreeNode;

import java.sql.Connection;
import java.sql.SQLException;
import java.util.List;

/**
 * Optional per-connector Explorer routine metadata (functions / procedures / triggers).
 * <p>Prefer Request-based overloads at call sites. Implementations typically override
 * the long-parameter methods (and SQL-paged {@code *Page} overloads when available).
 */
public interface JdbcRoutineLister {

    boolean supports(String dbType);

    /** Lower value wins when multiple listers match. */
    default int priority() {
        return 100;
    }

    List<TreeNode> listFunctions(
                                 Connection connection,
                                 String connectionId,
                                 String catalog,
                                 String schema,
                                 String dbType) throws SQLException;

    List<TreeNode> listProcedures(
                                  Connection connection,
                                  String connectionId,
                                  String catalog,
                                  String schema,
                                  String dbType) throws SQLException;

    List<TreeNode> listTriggers(
                                Connection connection,
                                String connectionId,
                                String catalog,
                                String schema,
                                String dbType) throws SQLException;

    default List<TreeNode> listFunctions(ExplorerListRequest request) throws SQLException {
        return listFunctions(
                request.connection(),
                request.connectionId(),
                request.catalog(),
                request.schema(),
                request.dbType());
    }

    default List<TreeNode> listProcedures(ExplorerListRequest request) throws SQLException {
        return listProcedures(
                request.connection(),
                request.connectionId(),
                request.catalog(),
                request.schema(),
                request.dbType());
    }

    default List<TreeNode> listTriggers(ExplorerListRequest request) throws SQLException {
        return listTriggers(
                request.connection(),
                request.connectionId(),
                request.catalog(),
                request.schema(),
                request.dbType());
    }

    default PaginatedTreeNodes listFunctionsPage(
                                                 Connection connection,
                                                 String connectionId,
                                                 String catalog,
                                                 String schema,
                                                 String dbType,
                                                 int offset,
                                                 int limit,
                                                 String namePattern) throws SQLException {
        return ExplorerListings.sliceFullList(
                listFunctions(connection, connectionId, catalog, schema, dbType),
                offset,
                limit,
                namePattern);
    }

    default PaginatedTreeNodes listProceduresPage(
                                                  Connection connection,
                                                  String connectionId,
                                                  String catalog,
                                                  String schema,
                                                  String dbType,
                                                  int offset,
                                                  int limit,
                                                  String namePattern) throws SQLException {
        return ExplorerListings.sliceFullList(
                listProcedures(connection, connectionId, catalog, schema, dbType),
                offset,
                limit,
                namePattern);
    }

    default PaginatedTreeNodes listTriggersPage(
                                                Connection connection,
                                                String connectionId,
                                                String catalog,
                                                String schema,
                                                String dbType,
                                                int offset,
                                                int limit,
                                                String namePattern) throws SQLException {
        return ExplorerListings.sliceFullList(
                listTriggers(connection, connectionId, catalog, schema, dbType),
                offset,
                limit,
                namePattern);
    }

    default PaginatedTreeNodes listFunctionsPage(ExplorerPageRequest request) throws SQLException {
        return listFunctionsPage(
                request.connection(),
                request.connectionId(),
                request.catalog(),
                request.schema(),
                request.dbType(),
                request.offset(),
                request.limit(),
                request.namePattern());
    }

    default PaginatedTreeNodes listProceduresPage(ExplorerPageRequest request) throws SQLException {
        return listProceduresPage(
                request.connection(),
                request.connectionId(),
                request.catalog(),
                request.schema(),
                request.dbType(),
                request.offset(),
                request.limit(),
                request.namePattern());
    }

    default PaginatedTreeNodes listTriggersPage(ExplorerPageRequest request) throws SQLException {
        return listTriggersPage(
                request.connection(),
                request.connectionId(),
                request.catalog(),
                request.schema(),
                request.dbType(),
                request.offset(),
                request.limit(),
                request.namePattern());
    }
}
