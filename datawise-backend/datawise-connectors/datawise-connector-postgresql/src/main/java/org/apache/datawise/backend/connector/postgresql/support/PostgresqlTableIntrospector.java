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
