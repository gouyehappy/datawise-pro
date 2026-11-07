package org.apache.datawise.backend.connector.trino.support;

import org.apache.datawise.backend.domain.PaginatedTreeNodes;
import org.apache.datawise.backend.domain.TreeNode;
import org.apache.datawise.backend.schema.introspect.JdbcNamePatternSupport;
import org.apache.datawise.backend.schema.introspect.JdbcPagedNameQuerySupport;
import org.apache.datawise.backend.schema.introspect.ScopedSchemaMetadataQueries;
import org.apache.datawise.backend.schema.spi.JdbcExplorerMetadataSupport;

import java.sql.Connection;
import java.sql.SQLException;
import java.util.List;
import java.util.Objects;
import java.util.function.Predicate;

/** Trino / Presto information_schema metadata. */
public final class TrinoFamilySchemaMetadataSupport implements JdbcExplorerMetadataSupport {

    private final Predicate<String> dbTypeMatcher;

    public TrinoFamilySchemaMetadataSupport(Predicate<String> dbTypeMatcher) {
        this.dbTypeMatcher = Objects.requireNonNull(dbTypeMatcher, "dbTypeMatcher");
    }

    @Override
    public boolean supports(String dbType) {
        return dbTypeMatcher.test(dbType);
    }

    @Override
    public int priority() {
        return 20;
    }

    @Override
    public List<TreeNode> listViews(
            Connection connection, String connectionId, String catalog, String schema, String dbType
    ) throws SQLException {
        if (catalog == null || catalog.isBlank() || schema == null || schema.isBlank()) {
            return List.of();
        }
        String catalogName = catalog.trim();
        String schemaName = schema.trim();
        return ScopedSchemaMetadataQueries.listViewNodes(
                connection,
                connectionId,
                catalogName,
                schemaName,
                """
                        SELECT table_name
                        FROM information_schema.views
                        WHERE table_catalog = ? AND table_schema = ?
                        ORDER BY table_name
                        """,
                ps -> {
                    ps.setString(1, catalogName);
                    ps.setString(2, schemaName);
                }
        );
    }

    @Override
    public PaginatedTreeNodes listViewsPage(
            Connection connection,
            String connectionId,
            String catalog,
            String schema,
            String dbType,
            int offset,
            int limit,
            String namePattern
    ) throws SQLException {
        if (catalog == null || catalog.isBlank() || schema == null || schema.isBlank()) {
            return PaginatedTreeNodes.empty();
        }
        String catalogName = catalog.trim();
        String schemaName = schema.trim();
        String like = JdbcNamePatternSupport.toSqlLikePattern(namePattern);
        String sql = ScopedSchemaMetadataQueries.withOptionalLike("""
                SELECT table_name
                FROM information_schema.views
                WHERE table_catalog = ? AND table_schema = ?
                ORDER BY table_name
                """, "table_name", like);
        return ScopedSchemaMetadataQueries.pageViewNodes(
                connection,
                connectionId,
                catalogName,
                schemaName,
                sql,
                JdbcPagedNameQuerySupport.PageSyntax.OFFSET_LIMIT,
                (ps, startParam) -> {
                    int param = startParam;
                    ps.setString(param++, catalogName);
                    ps.setString(param++, schemaName);
                    if (like != null) {
                        ps.setString(param++, like);
                    }
                    return param;
                },
                offset,
                limit
        );
    }

    @Override
    public List<TreeNode> listFunctions(
            Connection connection, String connectionId, String catalog, String schema, String dbType
    ) throws SQLException {
        return listRoutines(connection, connectionId, catalog, schema, "FUNCTION", "function", "fn");
    }

    @Override
    public List<TreeNode> listProcedures(
            Connection connection, String connectionId, String catalog, String schema, String dbType
    ) throws SQLException {
        return listRoutines(connection, connectionId, catalog, schema, "PROCEDURE", "procedure", "proc");
    }

    @Override
    public List<TreeNode> listTriggers(
            Connection connection, String connectionId, String catalog, String schema, String dbType
    ) {
        return List.of();
    }

    @Override
    public PaginatedTreeNodes listFunctionsPage(
            Connection connection,
            String connectionId,
            String catalog,
            String schema,
            String dbType,
            int offset,
            int limit,
            String namePattern
    ) throws SQLException {
        return listRoutinesPage(
                connection, connectionId, catalog, schema,
                "FUNCTION", "function", "fn", offset, limit, namePattern
        );
    }

    @Override
    public PaginatedTreeNodes listProceduresPage(
            Connection connection,
            String connectionId,
            String catalog,
            String schema,
            String dbType,
            int offset,
            int limit,
            String namePattern
    ) throws SQLException {
        return listRoutinesPage(
                connection, connectionId, catalog, schema,
                "PROCEDURE", "procedure", "proc", offset, limit, namePattern
        );
    }

    @Override
    public PaginatedTreeNodes listTriggersPage(
            Connection connection,
            String connectionId,
            String catalog,
            String schema,
            String dbType,
            int offset,
            int limit,
            String namePattern
    ) {
        return PaginatedTreeNodes.empty();
    }

    private static List<TreeNode> listRoutines(
            Connection connection,
            String connectionId,
            String catalog,
            String schema,
            String routineType,
            String nodeType,
            String idPrefix
    ) throws SQLException {
        if (catalog == null || catalog.isBlank() || schema == null || schema.isBlank()) {
            return List.of();
        }
        String catalogName = catalog.trim();
        String schemaName = schema.trim();
        return ScopedSchemaMetadataQueries.listRoutineNodes(
                connection,
                connectionId,
                catalogName,
                schemaName,
                nodeType,
                idPrefix,
                """
                        SELECT routine_name
                        FROM information_schema.routines
                        WHERE routine_catalog = ? AND routine_schema = ? AND routine_type = ?
                        ORDER BY routine_name
                        """,
                ps -> {
                    ps.setString(1, catalogName);
                    ps.setString(2, schemaName);
                    ps.setString(3, routineType);
                }
        );
    }

    private static PaginatedTreeNodes listRoutinesPage(
            Connection connection,
            String connectionId,
            String catalog,
            String schema,
            String routineType,
            String nodeType,
            String idPrefix,
            int offset,
            int limit,
            String namePattern
    ) throws SQLException {
        if (catalog == null || catalog.isBlank() || schema == null || schema.isBlank()) {
            return PaginatedTreeNodes.empty();
        }
        String catalogName = catalog.trim();
        String schemaName = schema.trim();
        String like = JdbcNamePatternSupport.toSqlLikePattern(namePattern);
        String sql = ScopedSchemaMetadataQueries.withOptionalLike("""
                SELECT routine_name
                FROM information_schema.routines
                WHERE routine_catalog = ? AND routine_schema = ? AND routine_type = ?
                ORDER BY routine_name
                """, "routine_name", like);
        return ScopedSchemaMetadataQueries.pageRoutineNodes(
                connection,
                connectionId,
                catalogName,
                schemaName,
                nodeType,
                idPrefix,
                sql,
                JdbcPagedNameQuerySupport.PageSyntax.OFFSET_LIMIT,
                (ps, startParam) -> {
                    int param = startParam;
                    ps.setString(param++, catalogName);
                    ps.setString(param++, schemaName);
                    ps.setString(param++, routineType);
                    if (like != null) {
                        ps.setString(param++, like);
                    }
                    return param;
                },
                offset,
                limit
        );
    }
}
