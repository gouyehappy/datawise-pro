package org.apache.datawise.backend.schema.introspect.oracle;

import org.apache.datawise.backend.domain.PaginatedTreeNodes;
import org.apache.datawise.backend.domain.TreeNode;
import org.apache.datawise.backend.schema.introspect.JdbcNamePatternSupport;
import org.apache.datawise.backend.schema.introspect.JdbcNameQuerySupport;
import org.apache.datawise.backend.schema.introspect.JdbcPagedNameQuerySupport;
import org.apache.datawise.backend.schema.introspect.ScopedSchemaMetadataQueries;
import org.apache.datawise.backend.schema.introspect.routines.JdbcRoutineListingSupport;
import org.apache.datawise.backend.schema.introspect.views.JdbcViewListingSupport;

import java.sql.Connection;
import java.sql.SQLException;
import java.util.List;
import java.util.Locale;

/**
 * Shared Oracle / Dameng data-dictionary listing for Explorer views and routines.
 *
 * <p>Owner resolution is intentionally narrower than paged table listing
 * ({@code OracleFastTableLister} / {@link org.apache.datawise.backend.schema.introspect.JdbcSchemaListingScopes#resolveOracleOwner}):
 * only {@code schema}, else {@code catalog}, else empty (no query). There is no
 * {@code SchemaScope} pattern or connection/{@code USER} fallback — that matches historical
 * Explorer view/routine behavior and must not be unified with table owner resolution.
 */
public final class OracleFamilyDictionaryListing {

    private OracleFamilyDictionaryListing() {
    }

    public static List<TreeNode> listViews(
                                           Connection connection, String connectionId, String catalog, String schema) throws SQLException {
        return withOwner(catalog, schema, owner -> JdbcViewListingSupport.toViewNodes(
                connectionId,
                catalog,
                owner,
                JdbcNameQuerySupport.queryNames(connection, """
                        SELECT view_name FROM all_views WHERE owner = ? ORDER BY view_name
                        """, ps -> ps.setString(1, owner))));
    }

    public static PaginatedTreeNodes listViewsPage(
                                                   Connection connection,
                                                   String connectionId,
                                                   String catalog,
                                                   String schema,
                                                   int offset,
                                                   int limit,
                                                   String namePattern) throws SQLException {
        return withOwnerPage(catalog, schema, owner -> {
            String like = upperLike(namePattern);
            String sql = ScopedSchemaMetadataQueries.withOptionalLike("""
                    SELECT view_name FROM all_views WHERE owner = ?
                    ORDER BY view_name
                    """, "view_name", like);
            return ScopedSchemaMetadataQueries.pageViewNodes(
                    connection,
                    connectionId,
                    catalog,
                    owner,
                    sql,
                    JdbcPagedNameQuerySupport.PageSyntax.OFFSET_FETCH,
                    ScopedSchemaMetadataQueries.bindSchemaAndOptionalLike(owner, like),
                    offset,
                    limit);
        });
    }

    public static List<TreeNode> listFunctions(
                                               Connection connection, String connectionId, String catalog, String schema) throws SQLException {
        return listObjectNodes(connection, connectionId, catalog, schema, "function", "fn", """
                SELECT object_name
                FROM all_objects
                WHERE owner = ? AND object_type = 'FUNCTION'
                ORDER BY object_name
                """);
    }

    public static PaginatedTreeNodes listFunctionsPage(
                                                       Connection connection,
                                                       String connectionId,
                                                       String catalog,
                                                       String schema,
                                                       int offset,
                                                       int limit,
                                                       String namePattern) throws SQLException {
        return listObjectNodesPage(
                connection, connectionId, catalog, schema, "function", "fn",
                """
                        SELECT object_name
                        FROM all_objects
                        WHERE owner = ? AND object_type = 'FUNCTION'
                        ORDER BY object_name
                        """,
                "object_name",
                offset,
                limit,
                namePattern);
    }

    public static List<TreeNode> listProcedures(
                                                Connection connection, String connectionId, String catalog, String schema) throws SQLException {
        return listObjectNodes(connection, connectionId, catalog, schema, "procedure", "proc", """
                SELECT object_name
                FROM all_objects
                WHERE owner = ?
                  AND object_type IN ('PROCEDURE', 'PACKAGE')
                ORDER BY object_name
                """);
    }

    public static PaginatedTreeNodes listProceduresPage(
                                                        Connection connection,
                                                        String connectionId,
                                                        String catalog,
                                                        String schema,
                                                        int offset,
                                                        int limit,
                                                        String namePattern) throws SQLException {
        return listObjectNodesPage(
                connection, connectionId, catalog, schema, "procedure", "proc",
                """
                        SELECT object_name
                        FROM all_objects
                        WHERE owner = ?
                          AND object_type IN ('PROCEDURE', 'PACKAGE')
                        ORDER BY object_name
                        """,
                "object_name",
                offset,
                limit,
                namePattern);
    }

    public static List<TreeNode> listTriggers(
                                              Connection connection, String connectionId, String catalog, String schema) throws SQLException {
        return listObjectNodes(connection, connectionId, catalog, schema, "trigger", "trg", """
                SELECT trigger_name FROM all_triggers WHERE owner = ? ORDER BY trigger_name
                """);
    }

    public static PaginatedTreeNodes listTriggersPage(
                                                      Connection connection,
                                                      String connectionId,
                                                      String catalog,
                                                      String schema,
                                                      int offset,
                                                      int limit,
                                                      String namePattern) throws SQLException {
        return listObjectNodesPage(
                connection, connectionId, catalog, schema, "trigger", "trg",
                """
                        SELECT trigger_name FROM all_triggers WHERE owner = ?
                        ORDER BY trigger_name
                        """,
                "trigger_name",
                offset,
                limit,
                namePattern);
    }

    private static List<TreeNode> listObjectNodes(
                                                  Connection connection,
                                                  String connectionId,
                                                  String catalog,
                                                  String schema,
                                                  String nodeType,
                                                  String idPrefix,
                                                  String sql) throws SQLException {
        return withOwner(catalog, schema, owner -> JdbcRoutineListingSupport.toRoutineNodes(
                connectionId,
                catalog,
                owner,
                nodeType,
                idPrefix,
                JdbcNameQuerySupport.queryNames(connection, sql, ps -> ps.setString(1, owner))));
    }

    private static PaginatedTreeNodes listObjectNodesPage(
                                                          Connection connection,
                                                          String connectionId,
                                                          String catalog,
                                                          String schema,
                                                          String nodeType,
                                                          String idPrefix,
                                                          String orderedSql,
                                                          String likeColumn,
                                                          int offset,
                                                          int limit,
                                                          String namePattern) throws SQLException {
        return withOwnerPage(catalog, schema, owner -> {
            String like = upperLike(namePattern);
            String sql = ScopedSchemaMetadataQueries.withOptionalLike(orderedSql, likeColumn, like);
            return ScopedSchemaMetadataQueries.pageRoutineNodes(
                    connection,
                    connectionId,
                    catalog,
                    owner,
                    nodeType,
                    idPrefix,
                    sql,
                    JdbcPagedNameQuerySupport.PageSyntax.OFFSET_FETCH,
                    ScopedSchemaMetadataQueries.bindSchemaAndOptionalLike(owner, like),
                    offset,
                    limit);
        });
    }

    private static List<TreeNode> withOwner(
                                            String catalog,
                                            String schema,
                                            OwnerQuery query) throws SQLException {
        String owner = resolveOwner(catalog, schema);
        if (owner.isBlank()) {
            return List.of();
        }
        return query.run(owner);
    }

    private static PaginatedTreeNodes withOwnerPage(
                                                    String catalog,
                                                    String schema,
                                                    OwnerPageQuery query) throws SQLException {
        String owner = resolveOwner(catalog, schema);
        if (owner.isBlank()) {
            return PaginatedTreeNodes.empty();
        }
        return query.run(owner);
    }

    private static String upperLike(String namePattern) {
        String like = JdbcNamePatternSupport.toSqlLikePattern(namePattern);
        return like != null ? like.toUpperCase(Locale.ROOT) : null;
    }

    static String resolveOwner(String catalog, String schema) {
        if (schema != null && !schema.isBlank()) {
            return schema.trim().toUpperCase(Locale.ROOT);
        }
        if (catalog != null && !catalog.isBlank()) {
            return catalog.trim().toUpperCase(Locale.ROOT);
        }
        return "";
    }

    @FunctionalInterface
    private interface OwnerQuery {

        List<TreeNode> run(String owner) throws SQLException;
    }

    @FunctionalInterface
    private interface OwnerPageQuery {

        PaginatedTreeNodes run(String owner) throws SQLException;
    }
}
