package org.apache.datawise.backend.schema.introspect;

import org.apache.datawise.backend.domain.PaginatedTreeNodes;
import org.apache.datawise.backend.domain.TreeNode;
import org.apache.datawise.backend.schema.introspect.routines.JdbcRoutineListingSupport;
import org.apache.datawise.backend.schema.introspect.views.JdbcViewListingSupport;

import java.sql.Connection;
import java.sql.SQLException;
import java.util.List;
import java.util.function.Function;

/**
 * Template helpers for dialect Explorer metadata: resolve a schema scope, then run
 * either a full name query or a SQL-paged name query.
 */
public final class ScopedSchemaMetadataQueries {

    private ScopedSchemaMetadataQueries() {
    }

    public static List<TreeNode> listViewNodes(
                                               Connection connection,
                                               String connectionId,
                                               String catalog,
                                               String schemaForNodes,
                                               String orderedSql,
                                               JdbcNameQuerySupport.SqlBinder binder) throws SQLException {
        return JdbcViewListingSupport.toViewNodes(
                connectionId,
                catalog,
                schemaForNodes,
                JdbcNameQuerySupport.queryNames(connection, orderedSql, binder));
    }

    public static List<TreeNode> listRoutineNodes(
                                                  Connection connection,
                                                  String connectionId,
                                                  String catalog,
                                                  String schemaForNodes,
                                                  String nodeType,
                                                  String idPrefix,
                                                  String orderedSql,
                                                  JdbcNameQuerySupport.SqlBinder binder) throws SQLException {
        return JdbcRoutineListingSupport.toRoutineNodes(
                connectionId,
                catalog,
                schemaForNodes,
                nodeType,
                idPrefix,
                JdbcNameQuerySupport.queryNames(connection, orderedSql, binder));
    }

    public static PaginatedTreeNodes pageViewNodes(
                                                   Connection connection,
                                                   String connectionId,
                                                   String catalog,
                                                   String schemaForNodes,
                                                   String orderedSqlWithoutPage,
                                                   JdbcPagedNameQuerySupport.PageSyntax syntax,
                                                   JdbcPagedNameQuerySupport.ScopeBinder scopeBinder,
                                                   int offset,
                                                   int limit) throws SQLException {
        return pageNodes(
                connection,
                orderedSqlWithoutPage,
                syntax,
                scopeBinder,
                offset,
                limit,
                names -> JdbcViewListingSupport.toViewNodes(connectionId, catalog, schemaForNodes, names));
    }

    public static PaginatedTreeNodes pageRoutineNodes(
                                                      Connection connection,
                                                      String connectionId,
                                                      String catalog,
                                                      String schemaForNodes,
                                                      String nodeType,
                                                      String idPrefix,
                                                      String orderedSqlWithoutPage,
                                                      JdbcPagedNameQuerySupport.PageSyntax syntax,
                                                      JdbcPagedNameQuerySupport.ScopeBinder scopeBinder,
                                                      int offset,
                                                      int limit) throws SQLException {
        return pageNodes(
                connection,
                orderedSqlWithoutPage,
                syntax,
                scopeBinder,
                offset,
                limit,
                names -> JdbcRoutineListingSupport.toRoutineNodes(
                        connectionId, catalog, schemaForNodes, nodeType, idPrefix, names));
    }

    public static PaginatedTreeNodes pageNodes(
                                               Connection connection,
                                               String orderedSqlWithoutPage,
                                               JdbcPagedNameQuerySupport.PageSyntax syntax,
                                               JdbcPagedNameQuerySupport.ScopeBinder scopeBinder,
                                               int offset,
                                               int limit,
                                               Function<List<String>, List<TreeNode>> toNodes) throws SQLException {
        return JdbcPagedNameQuerySupport.queryPagedNames(
                connection,
                orderedSqlWithoutPage,
                syntax,
                scopeBinder,
                offset,
                limit,
                toNodes);
    }

    /** Bind schema (+ optional LIKE pattern) starting at {@code startParam}. */
    public static JdbcPagedNameQuerySupport.ScopeBinder bindSchemaAndOptionalLike(
                                                                                  String schemaValue,
                                                                                  String likePattern) {
        return (ps, startParam) -> {
            int param = startParam;
            ps.setString(param++, schemaValue);
            if (likePattern != null) {
                ps.setString(param++, likePattern);
            }
            return param;
        };
    }

    public static String withOptionalLike(String baseWhereOrderedSql, String likeColumn, String likePattern) {
        if (likePattern == null) {
            return baseWhereOrderedSql;
        }
        // Insert LIKE before ORDER BY if present; otherwise append.
        int orderAt = baseWhereOrderedSql.toLowerCase(java.util.Locale.ROOT).lastIndexOf(" order by ");
        String likeClause = " AND " + likeColumn + " LIKE ?";
        if (orderAt < 0) {
            return baseWhereOrderedSql + likeClause;
        }
        return baseWhereOrderedSql.substring(0, orderAt) + likeClause + baseWhereOrderedSql.substring(orderAt);
    }
}
