package org.apache.datawise.backend.metadata.jdbc;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.domain.TableColumnDetail;
import org.apache.datawise.backend.domain.TableDdlResult;
import org.apache.datawise.backend.domain.TableForeignKeyDetail;
import org.apache.datawise.backend.domain.TableIndexDetail;
import org.apache.datawise.backend.domain.TablePropertiesResult;
import org.apache.datawise.backend.metadata.spi.TableMetadataIntrospection;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.apache.datawise.backend.schema.CatalogSchemaScope;
import org.apache.datawise.backend.schema.SchemaDialectRegistry;
import org.apache.datawise.backend.schema.SchemaScope;
import org.apache.datawise.backend.schema.TableMetadataLoader;
import org.apache.datawise.backend.connector.api.support.TableMetadataSupport;
import org.springframework.stereotype.Component;

import java.sql.Connection;
import java.sql.DatabaseMetaData;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/** JDBC DatabaseMetaData 通用表元数据读取（兜底）。 */
@Component
public class GenericJdbcTableMetadataIntrospection implements TableMetadataIntrospection {

    private final SchemaDialectRegistry dialectRegistry;

    public GenericJdbcTableMetadataIntrospection(SchemaDialectRegistry dialectRegistry) {
        this.dialectRegistry = dialectRegistry;
    }

    @Override
    public boolean supports(String dbType) {
        return true;
    }

    @Override
    public int priority() {
        return 10_000;
    }

    @Override
    public TablePropertiesResult loadProperties(
                                                Connection connection,
                                                ConnectionEntity entity,
                                                String database,
                                                String tableName) throws SQLException {
        String dbType = DbType.normalizeId(entity.getDbType());
        boolean catalogSchemaFamily = DbType.isCatalogSchemaFamily(dbType);
        CatalogSchemaScope catalogSchema = catalogSchemaFamily ? CatalogSchemaScope.parse(database) : null;
        String catalog = catalogSchema != null && catalogSchema.catalog() != null && !catalogSchema.catalog().isBlank()
                ? catalogSchema.catalog()
                : TableMetadataSupport.resolveCatalog(connection, entity, database);
        SchemaScope scope = catalogSchema != null && catalogSchema.hasSchema()
                ? dialectRegistry.resolve(dbType).resolveScope(connection, catalog, catalogSchema.schema())
                : dialectRegistry.resolve(dbType).resolveScope(connection, catalog);
        DatabaseMetaData meta = connection.getMetaData();
        Set<String> primaryKeys = TableMetadataLoader.loadPrimaryKeyColumnNames(meta, scope, tableName);
        Map<String, String> indexKeyTypes = catalogSchemaFamily
                ? Map.of()
                : loadColumnIndexKeyTypes(meta, scope, tableName, primaryKeys);

        String comment = null;
        try (ResultSet rs = meta.getTables(scope.catalogPattern(), scope.schemaPattern(), tableName, new String[]{"TABLE"})) {
            if (rs.next()) {
                comment = TableMetadataSupport.blankToNull(rs.getString("REMARKS"));
            }
        }

        List<TableColumnDetail> columns = new ArrayList<>();
        int ordinal = 0;
        try (ResultSet rs = meta.getColumns(scope.catalogPattern(), scope.schemaPattern(), tableName, "%")) {
            while (rs.next()) {
                ordinal++;
                String columnName = rs.getString("COLUMN_NAME");
                String typeName = rs.getString("TYPE_NAME");
                int columnSize = rs.getInt("COLUMN_SIZE");
                int decimalDigits = rs.getInt("DECIMAL_DIGITS");
                boolean nullable = rs.getInt("NULLABLE") != DatabaseMetaData.columnNoNulls;
                String defaultValue = TableMetadataSupport.blankToNull(rs.getString("COLUMN_DEF"));
                String remarks = TableMetadataSupport.blankToNull(rs.getString("REMARKS"));
                String autoIncRaw = rs.getString("IS_AUTOINCREMENT");
                boolean autoIncrement = "YES".equalsIgnoreCase(autoIncRaw);
                String keyType = primaryKeys.contains(columnName.toLowerCase(Locale.ROOT))
                        ? "PRI"
                        : indexKeyTypes.get(columnName.toLowerCase(Locale.ROOT));
                columns.add(new TableColumnDetail(
                        ordinal,
                        columnName,
                        TableMetadataSupport.formatDataType(typeName, columnSize, decimalDigits),
                        nullable,
                        autoIncrement,
                        keyType,
                        defaultValue,
                        autoIncrement ? "auto_increment" : null,
                        remarks));
            }
        }

        List<TableForeignKeyDetail> foreignKeys = catalogSchemaFamily
                ? List.of()
                : TableMetadataSupport.mapForeignKeys(TableMetadataLoader.loadForeignKeyNodes(
                        meta, entity.getId(), catalog, tableName, scope));
        List<TableIndexDetail> indexes = catalogSchemaFamily
                ? List.of()
                : TableMetadataSupport.mapIndexes(TableMetadataLoader.loadIndexNodes(
                        meta, entity.getId(), catalog, tableName, scope));

        return new TablePropertiesResult(
                tableName,
                comment,
                null,
                null,
                null,
                null,
                columns,
                foreignKeys,
                indexes);
    }

    @Override
    public TableDdlResult loadDdl(
                                  Connection connection,
                                  ConnectionEntity entity,
                                  String database,
                                  String tableName) throws SQLException {
        throw new IllegalArgumentException("DDL is not supported for dbType: " + DbType.normalizeId(entity.getDbType()));
    }

    @Override
    public TablePropertiesResult loadViewProperties(
                                                    Connection connection,
                                                    ConnectionEntity entity,
                                                    String database,
                                                    String viewName) throws SQLException {
        String dbType = DbType.normalizeId(entity.getDbType());
        boolean catalogSchemaFamily = DbType.isCatalogSchemaFamily(dbType);
        CatalogSchemaScope catalogSchema = catalogSchemaFamily ? CatalogSchemaScope.parse(database) : null;
        String catalog = catalogSchema != null && catalogSchema.catalog() != null && !catalogSchema.catalog().isBlank()
                ? catalogSchema.catalog()
                : TableMetadataSupport.resolveCatalog(connection, entity, database);
        SchemaScope scope = catalogSchema != null && catalogSchema.hasSchema()
                ? dialectRegistry.resolve(dbType).resolveScope(connection, catalog, catalogSchema.schema())
                : dialectRegistry.resolve(dbType).resolveScope(connection, catalog);
        DatabaseMetaData meta = connection.getMetaData();
        String comment = JdbcRelationMetadataSupport.loadViewComment(meta, scope, viewName);
        List<TableColumnDetail> columns = JdbcRelationMetadataSupport.loadViewColumns(meta, scope, viewName);
        return new TablePropertiesResult(
                viewName,
                comment,
                null,
                null,
                null,
                null,
                columns,
                List.of(),
                List.of());
    }

    @Override
    public TableDdlResult loadViewDdl(
                                      Connection connection,
                                      ConnectionEntity entity,
                                      String database,
                                      String viewName) throws SQLException {
        String catalog = TableMetadataSupport.resolveCatalog(connection, entity, database);
        return new TableDdlResult(JdbcRelationMetadataSupport.loadViewDdlGeneric(connection, catalog, viewName));
    }

    private Map<String, String> loadColumnIndexKeyTypes(
                                                        DatabaseMetaData meta,
                                                        SchemaScope scope,
                                                        String tableName,
                                                        Set<String> primaryKeys) throws SQLException {
        Map<String, IndexKeyAccumulator> grouped = new HashMap<>();
        try (ResultSet rs = meta.getIndexInfo(scope.catalogPattern(), scope.schemaPattern(), tableName, false, false)) {
            while (rs.next()) {
                String indexName = rs.getString("INDEX_NAME");
                if (indexName == null || indexName.isBlank() || "PRIMARY".equalsIgnoreCase(indexName)) {
                    continue;
                }
                String columnName = rs.getString("COLUMN_NAME");
                if (columnName == null || columnName.isBlank()) {
                    continue;
                }
                if (primaryKeys.contains(columnName.toLowerCase(Locale.ROOT))) {
                    continue;
                }
                boolean nonUnique = rs.getBoolean("NON_UNIQUE");
                grouped.computeIfAbsent(columnName.toLowerCase(Locale.ROOT), ignored -> new IndexKeyAccumulator())
                        .register(nonUnique);
            }
        }

        Map<String, String> keyTypes = new LinkedHashMap<>();
        for (Map.Entry<String, IndexKeyAccumulator> entry : grouped.entrySet()) {
            keyTypes.put(entry.getKey(), entry.getValue().keyType());
        }
        return keyTypes;
    }

    private static final class IndexKeyAccumulator {

        private boolean hasUnique;
        private boolean hasNonUnique;

        private void register(boolean nonUnique) {
            if (nonUnique) {
                hasNonUnique = true;
            } else {
                hasUnique = true;
            }
        }

        private String keyType() {
            if (hasUnique) {
                return "UNI";
            }
            return "MUL";
        }
    }
}
