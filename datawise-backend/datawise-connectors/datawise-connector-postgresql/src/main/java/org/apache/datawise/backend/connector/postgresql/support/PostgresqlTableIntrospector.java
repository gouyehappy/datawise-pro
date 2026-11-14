package org.apache.datawise.backend.connector.postgresql.support;

import org.apache.datawise.backend.connector.postgresql.ddl.PostgresqlDdlRenderer;
import org.apache.datawise.backend.connector.postgresql.schema.PostgresqlSchemaDialect;
import org.apache.datawise.backend.ddl.DdlRenderOptions;
import org.apache.datawise.backend.domain.TableColumnDetail;
import org.apache.datawise.backend.domain.TableDdlResult;
import org.apache.datawise.backend.domain.TableForeignKeyDetail;
import org.apache.datawise.backend.domain.TableIndexDetail;
import org.apache.datawise.backend.domain.TablePropertiesResult;
import org.apache.datawise.backend.metadata.ColumnDefinition;
import org.apache.datawise.backend.metadata.IndexDefinition;
import org.apache.datawise.backend.metadata.LogicalType;
import org.apache.datawise.backend.metadata.TableDefinition;
import org.apache.datawise.backend.metadata.spi.TableMetadataIntrospection;
import org.apache.datawise.backend.model.ConnectionEntity;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

public class PostgresqlTableIntrospector implements TableMetadataIntrospection {

    private final PostgresqlSchemaDialect postgresqlSchemaDialect;
    private final PostgresqlDdlRenderer ddlRenderer;
    private final PostgresqlColumnIntrospector columnIntrospector;
    private final PostgresqlIndexIntrospector indexIntrospector;

    public PostgresqlTableIntrospector(
            PostgresqlSchemaDialect postgresqlSchemaDialect,
            PostgresqlDdlRenderer ddlRenderer
    ) {
        this.postgresqlSchemaDialect = postgresqlSchemaDialect;
        this.ddlRenderer = ddlRenderer != null ? ddlRenderer : new PostgresqlDdlRenderer();
        this.columnIntrospector = new PostgresqlColumnIntrospector();
        this.indexIntrospector = new PostgresqlIndexIntrospector();
    }

    @Override
    public boolean supports(String dbType) {
        return postgresqlSchemaDialect.supports(dbType);
    }

    @Override
    public int priority() {
        return 20;
    }

    @Override
    public TablePropertiesResult loadProperties(
            Connection connection,
            ConnectionEntity entity,
            String schema,
            String tableName
    ) throws SQLException {
        TableDefinition definition = extractTableDefinition(connection, entity, schema, tableName);
        Map<String, String> keyTypes = new LinkedHashMap<>();
        if (definition.primaryKey() != null) {
            for (String column : definition.primaryKey().columnNames()) {
                keyTypes.put(column.toLowerCase(Locale.ROOT), "PRI");
            }
        }
        for (IndexDefinition index : definition.indexes()) {
            if (index.unique()) {
                for (String column : index.columnNames()) {
                    keyTypes.putIfAbsent(column.toLowerCase(Locale.ROOT), "UNI");
                }
            }
        }
        List<TableColumnDetail> columns = new ArrayList<>();
        for (ColumnDefinition column : definition.columns()) {
            columns.add(new TableColumnDetail(
                    column.ordinalPosition(),
                    column.name(),
                    renderDataType(column.type()),
                    column.nullable(),
                    column.autoIncrement(),
                    keyTypes.get(column.name().toLowerCase(Locale.ROOT)),
                    column.defaultExpression(),
                    column.autoIncrement() ? "identity" : null,
                    column.comment()
            ));
        }
        List<TableForeignKeyDetail> foreignKeys = definition.foreignKeys().stream()
                .map(fk -> new TableForeignKeyDetail(
                        fk.name(),
                        String.join(", ", fk.columnNames()),
                        fk.referencedTable(),
                        String.join(", ", fk.referencedColumns())
                ))
                .toList();
        List<TableIndexDetail> indexes = definition.indexes().stream()
                .map(index -> new TableIndexDetail(
                        index.name(),
                        index.unique(),
                        String.join(", ", index.columnNames())
                ))
                .toList();
        return new TablePropertiesResult(
                tableName,
                definition.comment(),
                null,
                null,
                null,
                null,
                columns,
                foreignKeys,
                indexes
        );
    }

    @Override
    public TableDdlResult loadDdl(
            Connection connection,
            ConnectionEntity entity,
            String schema,
            String tableName
    ) throws SQLException {
        TableDefinition definition = extractTableDefinition(connection, entity, schema, tableName);
        return new TableDdlResult(renderCreateTable(definition));
    }

    @Override
    public TablePropertiesResult loadViewProperties(
            Connection connection,
            ConnectionEntity entity,
            String schema,
            String viewName
    ) throws SQLException {
        List<TableColumnDetail> columns = new ArrayList<>();
        for (ColumnDefinition column : columnIntrospector.loadColumns(connection, schema, viewName)) {
            columns.add(new TableColumnDetail(
                    column.ordinalPosition(),
                    column.name(),
                    renderDataType(column.type()),
                    column.nullable(),
                    column.autoIncrement(),
                    null,
                    column.defaultExpression(),
                    column.autoIncrement() ? "identity" : null,
                    column.comment()
            ));
        }
        return new TablePropertiesResult(
                viewName,
                columnIntrospector.loadTableComment(connection, schema, viewName),
                null,
                null,
                null,
                null,
                columns,
                List.of(),
                List.of()
        );
    }

    @Override
    public TableDdlResult loadViewDdl(
            Connection connection,
            ConnectionEntity entity,
            String schema,
            String viewName
    ) throws SQLException {
        return new TableDdlResult(
                org.apache.datawise.backend.metadata.jdbc.JdbcRelationMetadataSupport.loadPostgresqlViewDdl(
                        connection,
                        schema,
                        viewName
                )
        );
    }

    @Override
    public TableDdlResult loadTriggerDdl(
            Connection connection,
            ConnectionEntity entity,
            String schema,
            String triggerName
    ) throws SQLException {
        String sql = """
                SELECT pg_get_triggerdef(t.oid, true)
                FROM pg_trigger t
                JOIN pg_class c ON c.oid = t.tgrelid
                JOIN pg_namespace n ON n.oid = c.relnamespace
                WHERE NOT t.tgisinternal
                  AND t.tgname = ?
                  AND n.nspname = ?
                """;
        return loadSingleDdl(connection, sql, triggerName, schema, "Trigger");
    }

    @Override
    public TableDdlResult loadFunctionDdl(
            Connection connection,
            ConnectionEntity entity,
            String schema,
            String functionName
    ) throws SQLException {
        return loadPostgresqlRoutineDdl(connection, schema, functionName, 'f', "Function");
    }

    @Override
    public TableDdlResult loadProcedureDdl(
            Connection connection,
            ConnectionEntity entity,
            String schema,
            String procedureName
    ) throws SQLException {
        return loadPostgresqlRoutineDdl(connection, schema, procedureName, 'p', "Procedure");
    }

    @Override
    public TableDdlResult loadSequenceDdl(
            Connection connection,
            ConnectionEntity entity,
            String schema,
            String sequenceName
    ) throws SQLException {
        String sql = """
                SELECT format(
                    'CREATE SEQUENCE %I.%I AS %s INCREMENT BY %s MINVALUE %s MAXVALUE %s START WITH %s CACHE %s%s',
                    n.nspname,
                    c.relname,
                    format_type(s.seqtypid, NULL),
                    s.seqincrement,
                    s.seqmin,
                    s.seqmax,
                    s.seqstart,
                    s.seqcache,
                    CASE WHEN s.seqcycle THEN ' CYCLE' ELSE ' NO CYCLE' END
                )
                FROM pg_class c
                JOIN pg_namespace n ON n.oid = c.relnamespace
                JOIN pg_sequence s ON s.seqrelid = c.oid
                WHERE c.relkind = 'S'
                  AND c.relname = ?
                  AND n.nspname = ?
                """;
        return loadSingleDdl(connection, sql, sequenceName, schema, "Sequence");
    }

    private TableDdlResult loadPostgresqlRoutineDdl(
            Connection connection,
            String schema,
            String name,
            char prokind,
            String kindLabel
    ) throws SQLException {
        String sql = """
                SELECT pg_get_functiondef(p.oid)
                FROM pg_proc p
                JOIN pg_namespace n ON n.oid = p.pronamespace
                WHERE p.proname = ?
                  AND n.nspname = ?
                  AND p.prokind = ?
                """;
        try (PreparedStatement ps = connection.prepareStatement(sql)) {
            ps.setString(1, name);
            ps.setString(2, schema);
            ps.setString(3, String.valueOf(prokind));
            try (ResultSet rs = ps.executeQuery()) {
                if (!rs.next()) {
                    throw new IllegalArgumentException(kindLabel + " not found: " + schema + "." + name);
                }
                String ddl = rs.getString(1);
                return new TableDdlResult(ddl != null ? ddl : "");
            }
        }
    }

    private static TableDdlResult loadSingleDdl(
            Connection connection,
            String sql,
            String name,
            String schema,
            String kindLabel
    ) throws SQLException {
        try (PreparedStatement ps = connection.prepareStatement(sql)) {
            ps.setString(1, name);
            ps.setString(2, schema);
            try (ResultSet rs = ps.executeQuery()) {
                if (!rs.next()) {
                    throw new IllegalArgumentException(kindLabel + " not found: " + schema + "." + name);
                }
                String ddl = rs.getString(1);
                return new TableDdlResult(ddl != null ? ddl : "");
            }
        }
    }

    @Override
    public TableDefinition extractTableDefinition(
            Connection connection,
            ConnectionEntity entity,
            String schema,
            String tableName
    ) throws SQLException {
        List<ColumnDefinition> columns = columnIntrospector.loadColumns(connection, schema, tableName);
        if (columns.isEmpty()) {
            throw new IllegalArgumentException("Table not found: " + schema + "." + tableName);
        }

        return new TableDefinition(
                connection.getCatalog(),
                schema,
                tableName,
                columns,
                indexIntrospector.loadPrimaryKey(connection, schema, tableName),
                indexIntrospector.loadIndexes(connection, schema, tableName),
                indexIntrospector.loadForeignKeys(connection, schema, tableName),
                Map.of(),
                columnIntrospector.loadTableComment(connection, schema, tableName)
        );
    }

    public String renderCreateTable(TableDefinition definition) {
        return ddlRenderer.renderCreateTable(definition, DdlRenderOptions.defaults());
    }

    public static String renderDataType(LogicalType type) {
        return PostgresqlColumnIntrospector.renderDataType(type);
    }
}
