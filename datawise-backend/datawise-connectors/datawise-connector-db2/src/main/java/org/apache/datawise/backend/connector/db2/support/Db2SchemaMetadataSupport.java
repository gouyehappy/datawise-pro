package org.apache.datawise.backend.connector.db2.support;

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
import java.util.Locale;

public final class Db2SchemaMetadataSupport implements JdbcExplorerMetadataSupport {

    private final SchemaDialectRegistry dialectRegistry;

    public Db2SchemaMetadataSupport(SchemaDialectRegistry dialectRegistry) {
        this.dialectRegistry = dialectRegistry;
    }

    @Override
    public boolean supports(String dbType) {
        return DbType.isDb2Family(dbType);
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
        String schemaBind = schemaName.toUpperCase(Locale.ROOT);
        return ScopedSchemaMetadataQueries.listViewNodes(
                connection,
                connectionId,
                catalog,
                schemaName,
                """
                        SELECT TABNAME FROM SYSCAT.TABLES
                        WHERE TABSCHEMA = ? AND TYPE = 'V'
                        ORDER BY TABNAME
                        """,
                ps -> ps.setString(1, schemaBind)
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
        String schemaBind = schemaName.toUpperCase(Locale.ROOT);
        String like = JdbcNamePatternSupport.toSqlLikePattern(namePattern);
        String sql = ScopedSchemaMetadataQueries.withOptionalLike("""
                SELECT TABNAME FROM SYSCAT.TABLES
                WHERE TABSCHEMA = ? AND TYPE = 'V'
                ORDER BY TABNAME
                """, "TABNAME", like);
        return ScopedSchemaMetadataQueries.pageViewNodes(
                connection,
                connectionId,
                catalog,
                schemaName,
                sql,
                JdbcPagedNameQuerySupport.PageSyntax.OFFSET_FETCH,
                ScopedSchemaMetadataQueries.bindSchemaAndOptionalLike(schemaBind, like),
                offset,
                limit
        );
    }

    @Override
    public List<TreeNode> listFunctions(
            Connection connection, String connectionId, String catalog, String schema, String dbType
    ) throws SQLException {
        String schemaName = resolveSchemaName(connection, catalog, schema, dbType);
        if (schemaName == null) {
            return List.of();
        }
        String schemaBind = schemaName.toUpperCase(Locale.ROOT);
        return ScopedSchemaMetadataQueries.listRoutineNodes(
                connection,
                connectionId,
                catalog,
                schemaName,
                "function",
                "fn",
                """
                        SELECT FUNCNAME FROM SYSCAT.FUNCTIONS
                        WHERE FUNCSCHEMA = ? AND ORIGIN != 'B'
                        ORDER BY FUNCNAME
                        """,
                ps -> ps.setString(1, schemaBind)
        );
    }

    @Override
    public List<TreeNode> listProcedures(
            Connection connection, String connectionId, String catalog, String schema, String dbType
    ) throws SQLException {
        String schemaName = resolveSchemaName(connection, catalog, schema, dbType);
        if (schemaName == null) {
            return List.of();
        }
        String schemaBind = schemaName.toUpperCase(Locale.ROOT);
        return ScopedSchemaMetadataQueries.listRoutineNodes(
                connection,
                connectionId,
                catalog,
                schemaName,
                "procedure",
                "proc",
                """
                        SELECT PROCNAME FROM SYSCAT.PROCEDURES
                        WHERE PROCSCHEMA = ?
                        ORDER BY PROCNAME
                        """,
                ps -> ps.setString(1, schemaBind)
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
        String schemaBind = schemaName.toUpperCase(Locale.ROOT);
        return ScopedSchemaMetadataQueries.listRoutineNodes(
                connection,
                connectionId,
                catalog,
                schemaName,
                "trigger",
                "trg",
                """
                        SELECT TRIGNAME FROM SYSCAT.TRIGGERS
                        WHERE TRIGSCHEMA = ?
                        ORDER BY TRIGNAME
                        """,
                ps -> ps.setString(1, schemaBind)
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
        return listRoutinesPage(
                connection,
                connectionId,
                catalog,
                schema,
                dbType,
                """
                        SELECT FUNCNAME FROM SYSCAT.FUNCTIONS
                        WHERE FUNCSCHEMA = ? AND ORIGIN != 'B'
                        ORDER BY FUNCNAME
                        """,
                "FUNCNAME",
                "function",
                "fn",
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
        return listRoutinesPage(
                connection,
                connectionId,
                catalog,
                schema,
                dbType,
                """
                        SELECT PROCNAME FROM SYSCAT.PROCEDURES
                        WHERE PROCSCHEMA = ?
                        ORDER BY PROCNAME
                        """,
                "PROCNAME",
                "procedure",
                "proc",
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
        return listRoutinesPage(
                connection,
                connectionId,
                catalog,
                schema,
                dbType,
                """
                        SELECT TRIGNAME FROM SYSCAT.TRIGGERS
                        WHERE TRIGSCHEMA = ?
                        ORDER BY TRIGNAME
                        """,
                "TRIGNAME",
                "trigger",
                "trg",
                offset,
                limit,
                namePattern
        );
    }

    private PaginatedTreeNodes listRoutinesPage(
            Connection connection,
            String connectionId,
            String catalog,
            String schema,
            String dbType,
            String orderedSql,
            String likeColumn,
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
        String schemaBind = schemaName.toUpperCase(Locale.ROOT);
        String like = JdbcNamePatternSupport.toSqlLikePattern(namePattern);
        String sql = ScopedSchemaMetadataQueries.withOptionalLike(orderedSql, likeColumn, like);
        return ScopedSchemaMetadataQueries.pageRoutineNodes(
                connection,
                connectionId,
                catalog,
                schemaName,
                nodeType,
                idPrefix,
                sql,
                JdbcPagedNameQuerySupport.PageSyntax.OFFSET_FETCH,
                ScopedSchemaMetadataQueries.bindSchemaAndOptionalLike(schemaBind, like),
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
        return JdbcSchemaListingScopes.resolveDb2SchemaName(catalog, schema, scope, connection);
    }
}
