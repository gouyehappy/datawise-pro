package org.apache.datawise.backend.connector.postgresql.support;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.domain.PaginatedTreeNodes;
import org.apache.datawise.backend.domain.TreeNode;
import org.apache.datawise.backend.schema.SchemaDialectRegistry;
import org.apache.datawise.backend.schema.SchemaScope;
import org.apache.datawise.backend.schema.introspect.JdbcNamePatternSupport;
import org.apache.datawise.backend.schema.introspect.JdbcPagedNameQuerySupport;
import org.apache.datawise.backend.schema.introspect.JdbcSchemaListingScopes;
import org.apache.datawise.backend.schema.introspect.ScopedSchemaMetadataQueries;
import org.apache.datawise.backend.schema.spi.JdbcExplorerMetadataSupport;

import java.sql.Connection;
import java.sql.SQLException;
import java.util.List;

/** PostgreSQL-family Explorer metadata. */
public final class PostgresqlSchemaMetadataSupport implements JdbcExplorerMetadataSupport {

    private final SchemaDialectRegistry dialectRegistry;

    public PostgresqlSchemaMetadataSupport(SchemaDialectRegistry dialectRegistry) {
        this.dialectRegistry = dialectRegistry;
    }

    @Override
    public boolean supports(String dbType) {
        return DbType.isPostgresqlFamily(dbType);
    }

    @Override
    public int priority() {
        return 20;
    }

    @Override
    public List<TreeNode> listViews(
            Connection connection, String connectionId, String catalog, String schema, String dbType
    ) throws SQLException {
        String schemaName = resolveSchemaName(connection, catalog, schema, dbType);
        if (schemaName == null) {
            return List.of();
        }
        return ScopedSchemaMetadataQueries.listViewNodes(
                connection,
                connectionId,
                catalog,
                schemaName,
                """
                        SELECT table_name
                        FROM information_schema.views
                        WHERE table_schema = ?
                        ORDER BY table_name
                        """,
                ps -> ps.setString(1, schemaName)
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
        String schemaName = resolveSchemaName(connection, catalog, schema, dbType);
        if (schemaName == null) {
            return PaginatedTreeNodes.empty();
        }
        String like = JdbcNamePatternSupport.toSqlLikePattern(namePattern);
        String sql = ScopedSchemaMetadataQueries.withOptionalLike("""
                SELECT table_name
                FROM information_schema.views
                WHERE table_schema = ?
                ORDER BY table_name
                """, "table_name", like);
        return ScopedSchemaMetadataQueries.pageViewNodes(
                connection,
                connectionId,
                catalog,
                schemaName,
                sql,
                JdbcPagedNameQuerySupport.PageSyntax.LIMIT_OFFSET,
                ScopedSchemaMetadataQueries.bindSchemaAndOptionalLike(schemaName, like),
                offset,
                limit
        );
    }

    @Override
    public List<TreeNode> listFunctions(
            Connection connection, String connectionId, String catalog, String schema, String dbType
    ) throws SQLException {
        return listPgRoutines(connection, connectionId, catalog, schema, dbType, "f", "function", "fn");
    }

    @Override
    public List<TreeNode> listProcedures(
            Connection connection, String connectionId, String catalog, String schema, String dbType
    ) throws SQLException {
        return listPgRoutines(connection, connectionId, catalog, schema, dbType, "p", "procedure", "proc");
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
        return listPgRoutinesPage(
                connection, connectionId, catalog, schema, dbType,
                "f", "function", "fn", offset, limit, namePattern
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
        return listPgRoutinesPage(
                connection, connectionId, catalog, schema, dbType,
                "p", "procedure", "proc", offset, limit, namePattern
        );
    }

    @Override
    public List<TreeNode> listTriggers(
            Connection connection, String connectionId, String catalog, String schema, String dbType
    ) throws SQLException {
        String schemaName = resolveSchemaName(connection, catalog, schema, dbType);
        if (schemaName == null) {
            return List.of();
        }
        return ScopedSchemaMetadataQueries.listRoutineNodes(
                connection,
                connectionId,
                catalog,
                schemaName,
                "trigger",
                "trg",
                """
                        SELECT t.tgname
                        FROM pg_trigger t
                        INNER JOIN pg_class c ON t.tgrelid = c.oid
                        INNER JOIN pg_namespace n ON c.relnamespace = n.oid
                        WHERE n.nspname = ? AND NOT t.tgisinternal
                        ORDER BY t.tgname
                        """,
                ps -> ps.setString(1, schemaName)
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
        String schemaName = resolveSchemaName(connection, catalog, schema, dbType);
        if (schemaName == null) {
            return PaginatedTreeNodes.empty();
        }
        String like = JdbcNamePatternSupport.toSqlLikePattern(namePattern);
        String sql = ScopedSchemaMetadataQueries.withOptionalLike("""
                SELECT t.tgname
                FROM pg_trigger t
                INNER JOIN pg_class c ON t.tgrelid = c.oid
                INNER JOIN pg_namespace n ON c.relnamespace = n.oid
                WHERE n.nspname = ? AND NOT t.tgisinternal
                ORDER BY t.tgname
                """, "t.tgname", like);
        return ScopedSchemaMetadataQueries.pageRoutineNodes(
                connection,
                connectionId,
                catalog,
                schemaName,
                "trigger",
                "trg",
                sql,
                JdbcPagedNameQuerySupport.PageSyntax.LIMIT_OFFSET,
                ScopedSchemaMetadataQueries.bindSchemaAndOptionalLike(schemaName, like),
                offset,
                limit
        );
    }

    private List<TreeNode> listPgRoutines(
            Connection connection,
            String connectionId,
            String catalog,
            String schema,
            String dbType,
            String prokind,
            String nodeType,
            String idPrefix
    ) throws SQLException {
        String schemaName = resolveSchemaName(connection, catalog, schema, dbType);
        if (schemaName == null) {
            return List.of();
        }
        return ScopedSchemaMetadataQueries.listRoutineNodes(
                connection,
                connectionId,
                catalog,
                schemaName,
                nodeType,
                idPrefix,
                """
                        SELECT p.proname
                        FROM pg_proc p
                        INNER JOIN pg_namespace n ON p.pronamespace = n.oid
                        WHERE n.nspname = ? AND p.prokind = ?
                        ORDER BY p.proname
                        """,
                ps -> {
                    ps.setString(1, schemaName);
                    ps.setString(2, prokind);
                }
        );
    }

    private PaginatedTreeNodes listPgRoutinesPage(
            Connection connection,
            String connectionId,
            String catalog,
            String schema,
            String dbType,
            String prokind,
            String nodeType,
            String idPrefix,
            int offset,
            int limit,
            String namePattern
    ) throws SQLException {
        String schemaName = resolveSchemaName(connection, catalog, schema, dbType);
        if (schemaName == null) {
            return PaginatedTreeNodes.empty();
        }
        String like = JdbcNamePatternSupport.toSqlLikePattern(namePattern);
        String sql = ScopedSchemaMetadataQueries.withOptionalLike("""
                SELECT p.proname
                FROM pg_proc p
                INNER JOIN pg_namespace n ON p.pronamespace = n.oid
                WHERE n.nspname = ? AND p.prokind = ?
                ORDER BY p.proname
                """, "p.proname", like);
        return ScopedSchemaMetadataQueries.pageRoutineNodes(
                connection,
                connectionId,
                catalog,
                schemaName,
                nodeType,
                idPrefix,
                sql,
                JdbcPagedNameQuerySupport.PageSyntax.LIMIT_OFFSET,
                (ps, startParam) -> {
                    int param = startParam;
                    ps.setString(param++, schemaName);
                    ps.setString(param++, prokind);
                    if (like != null) {
                        ps.setString(param++, like);
                    }
                    return param;
                },
                offset,
                limit
        );
    }

    private String resolveSchemaName(
            Connection connection, String catalog, String schema, String dbType
    ) throws SQLException {
        SchemaScope scope = JdbcSchemaListingScopes.resolveScope(
                connection, catalog, schema, dbType, dialectRegistry
        );
        if (scope == null) {
            return null;
        }
        if (schema != null && !schema.isBlank()) {
            return schema.trim();
        }
        return JdbcSchemaListingScopes.resolvePgSchema(scope, connection);
    }
}
