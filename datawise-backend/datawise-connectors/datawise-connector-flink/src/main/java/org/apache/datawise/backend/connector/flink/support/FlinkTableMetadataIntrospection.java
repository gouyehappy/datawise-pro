package org.apache.datawise.backend.connector.flink.support;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.connector.flink.schema.FlinkSchemaDialect;
import org.apache.datawise.backend.domain.TableColumnDetail;
import org.apache.datawise.backend.domain.TableDdlResult;
import org.apache.datawise.backend.domain.TablePropertiesResult;
import org.apache.datawise.backend.metadata.jdbc.JdbcRelationMetadataSupport;
import org.apache.datawise.backend.metadata.spi.TableMetadataIntrospection;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.apache.datawise.backend.schema.CatalogSchemaScope;
import org.apache.datawise.backend.schema.SchemaScope;
import org.apache.datawise.backend.schema.TableMetadataLoader;
import org.apache.datawise.backend.connector.api.support.TableMetadataSupport;

import java.sql.Connection;
import java.sql.DatabaseMetaData;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/** Flink / Flink table metadata: columns only (JDBC index metadata is unsupported). */
public class FlinkTableMetadataIntrospection implements TableMetadataIntrospection {

    private final FlinkSchemaDialect dialect = new FlinkSchemaDialect();

    @Override
    public boolean supports(String dbType) {
        return DbType.FLINK.matches(dbType);
    }

    @Override
    public int priority() {
        return 24;
    }

    @Override
    public TablePropertiesResult loadProperties(
            Connection connection,
            ConnectionEntity entity,
            String database,
            String tableName
    ) throws SQLException {
        CatalogSchemaScope names = CatalogSchemaScope.parse(database);
        String catalog = names.catalog() != null && !names.catalog().isBlank()
                ? names.catalog()
                : TableMetadataSupport.resolveCatalog(connection, entity, database);
        SchemaScope scope = names.hasSchema()
                ? dialect.resolveScope(connection, catalog, names.schema())
                : dialect.resolveScope(connection, catalog);

        DatabaseMetaData meta = connection.getMetaData();
        Set<String> primaryKeys = loadPrimaryKeysSafely(meta, scope, tableName);

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
                String keyType = primaryKeys.contains(columnName.toLowerCase(Locale.ROOT)) ? "PRI" : null;
                columns.add(new TableColumnDetail(
                        ordinal,
                        columnName,
                        TableMetadataSupport.formatDataType(typeName, columnSize, decimalDigits),
                        nullable,
                        autoIncrement,
                        keyType,
                        defaultValue,
                        autoIncrement ? "auto_increment" : null,
                        remarks
                ));
            }
        }

        return new TablePropertiesResult(
                tableName,
                comment,
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
    public TableDdlResult loadDdl(
            Connection connection,
            ConnectionEntity entity,
            String database,
            String tableName
    ) throws SQLException {
        String dbType = DbType.normalizeId(entity.getDbType());
        String qualified = DbType.quoteQualifiedTable(dbType, database, tableName);
        String sql = "SHOW CREATE TABLE " + qualified;
        try (Statement statement = connection.createStatement();
             ResultSet rs = statement.executeQuery(sql)) {
            if (!rs.next()) {
                throw new IllegalArgumentException("Table not found: " + qualified);
            }
            String ddl = rs.getString(1);
            if (ddl == null || ddl.isBlank()) {
                ddl = rs.getString("Create Table");
            }
            return new TableDdlResult(ddl != null ? ddl : "");
        }
    }

    @Override
    public TablePropertiesResult loadViewProperties(
            Connection connection,
            ConnectionEntity entity,
            String database,
            String viewName
    ) throws SQLException {
        CatalogSchemaScope names = CatalogSchemaScope.parse(database);
        String catalog = names.catalog() != null && !names.catalog().isBlank()
                ? names.catalog()
                : TableMetadataSupport.resolveCatalog(connection, entity, database);
        SchemaScope scope = names.hasSchema()
                ? dialect.resolveScope(connection, catalog, names.schema())
                : dialect.resolveScope(connection, catalog);

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
                List.of()
        );
    }

    @Override
    public TableDdlResult loadViewDdl(
            Connection connection,
            ConnectionEntity entity,
            String database,
            String viewName
    ) throws SQLException {
        String dbType = DbType.normalizeId(entity.getDbType());
        String qualified = DbType.quoteQualifiedTable(dbType, database, viewName);
        try {
            return new TableDdlResult(JdbcRelationMetadataSupport.loadTrinoViewDdl(connection, qualified));
        } catch (SQLException | IllegalArgumentException ex) {
            return loadDdl(connection, entity, database, viewName);
        }
    }

    private static Set<String> loadPrimaryKeysSafely(DatabaseMetaData meta, SchemaScope scope, String tableName) {
        try {
            return TableMetadataLoader.loadPrimaryKeyColumnNames(meta, scope, tableName);
        } catch (SQLException ex) {
            return Set.of();
        }
    }
}
