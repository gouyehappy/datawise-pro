package org.apache.datawise.backend.connector.mysql.support;

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

/** MySQL-protocol Explorer metadata (information_schema). */
public final class MysqlSchemaMetadataSupport implements JdbcExplorerMetadataSupport {

    private final SchemaDialectRegistry dialectRegistry;

    public MysqlSchemaMetadataSupport(SchemaDialectRegistry dialectRegistry) {
        this.dialectRegistry = dialectRegistry;
    }

    @Override
    public boolean supports(String dbType) {
        return DbType.isMysqlProtocol(dbType);
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
                        SELECT TABLE_NAME
                        FROM information_schema.VIEWS
                        WHERE TABLE_SCHEMA = ?
                        ORDER BY TABLE_NAME
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
                SELECT TABLE_NAME
                FROM information_schema.VIEWS
                WHERE TABLE_SCHEMA = ?
                ORDER BY TABLE_NAME
                """, "TABLE_NAME", like);
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
        return listRoutines(connection, connectionId, catalog, schema, dbType, "FUNCTION", "function", "fn");
    }

    @Override
    public List<TreeNode> listProcedures(
            Connection connection, String connectionId, String catalog, String schema, String dbType
    ) throws SQLException {
        return listRoutines(connection, connectionId, catalog, schema, dbType, "PROCEDURE", "procedure", "proc");
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
                connection, connectionId, catalog, schema, dbType,
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
                connection, connectionId, catalog, schema, dbType,
                "PROCEDURE", "procedure", "proc", offset, limit, namePattern
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
                        SELECT TRIGGER_NAME
                        FROM information_schema.TRIGGERS
                        WHERE TRIGGER_SCHEMA = ?
                        ORDER BY TRIGGER_NAME
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
                SELECT TRIGGER_NAME
                FROM information_schema.TRIGGERS
                WHERE TRIGGER_SCHEMA = ?
                ORDER BY TRIGGER_NAME
                """, "TRIGGER_NAME", like);
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

    private List<TreeNode> listRoutines(
            Connection connection,
            String connectionId,
            String catalog,
            String schema,
            String dbType,
            String routineType,
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
                        SELECT ROUTINE_NAME
                        FROM information_schema.ROUTINES
                        WHERE ROUTINE_SCHEMA = ? AND ROUTINE_TYPE = ?
                        ORDER BY ROUTINE_NAME
                        """,
                ps -> {
                    ps.setString(1, schemaName);
                    ps.setString(2, routineType);
                }
        );
    }

    private PaginatedTreeNodes listRoutinesPage(
            Connection connection,
            String connectionId,
            String catalog,
            String schema,
            String dbType,
            String routineType,
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
                SELECT ROUTINE_NAME
                FROM information_schema.ROUTINES
                WHERE ROUTINE_SCHEMA = ? AND ROUTINE_TYPE = ?
                ORDER BY ROUTINE_NAME
                """, "ROUTINE_NAME", like);
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

    private String resolveSchemaName(
            Connection connection, String catalog, String schema, String dbType
    ) throws SQLException {
        SchemaScope scope = JdbcSchemaListingScopes.resolveScope(
                connection, catalog, schema, dbType, dialectRegistry
        );
        if (scope == null) {
            return null;
        }
        return JdbcSchemaListingScopes.resolveMysqlSchemaName(catalog, schema, scope);
    }
}
