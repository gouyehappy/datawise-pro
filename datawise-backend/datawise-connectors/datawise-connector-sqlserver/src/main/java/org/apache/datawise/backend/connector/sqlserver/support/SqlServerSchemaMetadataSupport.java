package org.apache.datawise.backend.connector.sqlserver.support;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.domain.PaginatedTreeNodes;
import org.apache.datawise.backend.domain.TreeNode;
import org.apache.datawise.backend.jdbc.support.SqlServerCatalogSupport;
import org.apache.datawise.backend.jdbc.support.SqlServerMetadataScope;
import org.apache.datawise.backend.schema.introspect.JdbcNamePatternSupport;
import org.apache.datawise.backend.schema.introspect.JdbcPagedNameQuerySupport;
import org.apache.datawise.backend.schema.introspect.ScopedSchemaMetadataQueries;
import org.apache.datawise.backend.schema.spi.JdbcExplorerMetadataSupport;

import java.sql.Connection;
import java.sql.SQLException;
import java.util.List;

/** SQL Server routine/view metadata (catalog �?schema �?object). */
public final class SqlServerSchemaMetadataSupport implements JdbcExplorerMetadataSupport {

    @Override
    public boolean supports(String dbType) {
        return DbType.isSqlServerFamily(dbType);
    }

    @Override
    public int priority() {
        return 20;
    }

    @Override
    public List<TreeNode> listViews(
            Connection connection,
            String connectionId,
            String catalog,
            String schema,
            String dbType
    ) throws SQLException {
        SqlServerMetadataScope scope = listingScopeOrNull(connection, catalog, schema);
        if (scope == null) {
            return List.of();
        }
        return ScopedSchemaMetadataQueries.listViewNodes(
                connection,
                connectionId,
                scope.catalog(),
                scope.schema(),
                """
                        SELECT TABLE_NAME
                        FROM INFORMATION_SCHEMA.VIEWS
                        WHERE TABLE_SCHEMA = ?
                        ORDER BY TABLE_NAME
                        """,
                ps -> ps.setString(1, scope.schema())
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
        SqlServerMetadataScope scope = listingScopeOrNull(connection, catalog, schema);
        if (scope == null) {
            return PaginatedTreeNodes.empty();
        }
        String like = JdbcNamePatternSupport.toSqlLikePattern(namePattern);
        String sql = ScopedSchemaMetadataQueries.withOptionalLike("""
                SELECT TABLE_NAME
                FROM INFORMATION_SCHEMA.VIEWS
                WHERE TABLE_SCHEMA = ?
                ORDER BY TABLE_NAME
                """, "TABLE_NAME", like);
        return ScopedSchemaMetadataQueries.pageViewNodes(
                connection,
                connectionId,
                scope.catalog(),
                scope.schema(),
                sql,
                JdbcPagedNameQuerySupport.PageSyntax.OFFSET_FETCH,
                ScopedSchemaMetadataQueries.bindSchemaAndOptionalLike(scope.schema(), like),
                offset,
                limit
        );
    }

    @Override
    public List<TreeNode> listFunctions(
            Connection connection,
            String connectionId,
            String catalog,
            String schema,
            String dbType
    ) throws SQLException {
        return listObjectNodes(
                connection,
                connectionId,
                catalog,
                schema,
                "function",
                "fn",
                """
                        SELECT o.name
                        FROM sys.objects o
                        INNER JOIN sys.schemas s ON o.schema_id = s.schema_id
                        WHERE s.name = ? AND o.type IN ('FN', 'IF', 'TF')
                        ORDER BY o.name
                        """
        );
    }

    @Override
    public List<TreeNode> listProcedures(
            Connection connection,
            String connectionId,
            String catalog,
            String schema,
            String dbType
    ) throws SQLException {
        return listObjectNodes(
                connection,
                connectionId,
                catalog,
                schema,
                "procedure",
                "proc",
                """
                        SELECT o.name
                        FROM sys.objects o
                        INNER JOIN sys.schemas s ON o.schema_id = s.schema_id
                        WHERE s.name = ? AND o.type = 'P'
                        ORDER BY o.name
                        """
        );
    }

    @Override
    public List<TreeNode> listTriggers(
            Connection connection,
            String connectionId,
            String catalog,
            String schema,
            String dbType
    ) throws SQLException {
        return listObjectNodes(
                connection,
                connectionId,
                catalog,
                schema,
                "trigger",
                "trg",
                """
                        SELECT t.name
                        FROM sys.triggers t
                        INNER JOIN sys.objects parent ON t.parent_id = parent.object_id
                        INNER JOIN sys.schemas s ON parent.schema_id = s.schema_id
                        WHERE s.name = ?
                        ORDER BY t.name
                        """
        );
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
        return listObjectNodesPage(
                connection,
                connectionId,
                catalog,
                schema,
                "function",
                "fn",
                """
                        SELECT o.name
                        FROM sys.objects o
                        INNER JOIN sys.schemas s ON o.schema_id = s.schema_id
                        WHERE s.name = ? AND o.type IN ('FN', 'IF', 'TF')
                        ORDER BY o.name
                        """,
                "o.name",
                offset,
                limit,
                namePattern
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
        return listObjectNodesPage(
                connection,
                connectionId,
                catalog,
                schema,
                "procedure",
                "proc",
                """
                        SELECT o.name
                        FROM sys.objects o
                        INNER JOIN sys.schemas s ON o.schema_id = s.schema_id
                        WHERE s.name = ? AND o.type = 'P'
                        ORDER BY o.name
                        """,
                "o.name",
                offset,
                limit,
                namePattern
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
    ) throws SQLException {
        return listObjectNodesPage(
                connection,
                connectionId,
                catalog,
                schema,
                "trigger",
                "trg",
                """
                        SELECT t.name
                        FROM sys.triggers t
                        INNER JOIN sys.objects parent ON t.parent_id = parent.object_id
                        INNER JOIN sys.schemas s ON parent.schema_id = s.schema_id
                        WHERE s.name = ?
                        ORDER BY t.name
                        """,
                "t.name",
                offset,
                limit,
                namePattern
        );
    }

    private static List<TreeNode> listObjectNodes(
            Connection connection,
            String connectionId,
            String catalog,
            String schema,
            String nodeType,
            String idPrefix,
            String sql
    ) throws SQLException {
        SqlServerMetadataScope scope = listingScopeOrNull(connection, catalog, schema);
        if (scope == null) {
            return List.of();
        }
        return ScopedSchemaMetadataQueries.listRoutineNodes(
                connection,
                connectionId,
                scope.catalog(),
                scope.schema(),
                nodeType,
                idPrefix,
                sql,
                ps -> ps.setString(1, scope.schema())
        );
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
            String namePattern
    ) throws SQLException {
        SqlServerMetadataScope scope = listingScopeOrNull(connection, catalog, schema);
        if (scope == null) {
            return PaginatedTreeNodes.empty();
        }
        String like = JdbcNamePatternSupport.toSqlLikePattern(namePattern);
        String sql = ScopedSchemaMetadataQueries.withOptionalLike(orderedSql, likeColumn, like);
        return ScopedSchemaMetadataQueries.pageRoutineNodes(
                connection,
                connectionId,
                scope.catalog(),
                scope.schema(),
                nodeType,
                idPrefix,
                sql,
                JdbcPagedNameQuerySupport.PageSyntax.OFFSET_FETCH,
                ScopedSchemaMetadataQueries.bindSchemaAndOptionalLike(scope.schema(), like),
                offset,
                limit
        );
    }

    private static SqlServerMetadataScope listingScopeOrNull(
            Connection connection,
            String catalog,
            String schema
    ) throws SQLException {
        SqlServerMetadataScope scope = SqlServerCatalogSupport.resolveListingScope(connection, catalog, schema);
        if (SqlServerCatalogSupport.isSystemSchema(scope.schema())) {
            return null;
        }
        return scope;
    }
}
