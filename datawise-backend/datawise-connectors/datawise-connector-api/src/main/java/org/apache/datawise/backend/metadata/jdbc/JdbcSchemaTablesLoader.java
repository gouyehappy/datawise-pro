package org.apache.datawise.backend.metadata.jdbc;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.domain.SchemaTableSummary;
import org.apache.datawise.backend.domain.SchemaTablesResult;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.apache.datawise.backend.schema.CatalogSchemaScope;
import org.apache.datawise.backend.schema.SchemaDialectRegistry;
import org.apache.datawise.backend.schema.SchemaScope;
import org.apache.datawise.backend.connector.api.support.TableMetadataSupport;

import java.sql.Connection;
import java.sql.DatabaseMetaData;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

/** JDBC schema 级表清单（MySQL 族读 information_schema，其它走 DatabaseMetaData 兜底）。 */
public final class JdbcSchemaTablesLoader {

    private JdbcSchemaTablesLoader() {
    }

    public static SchemaTablesResult load(
                                          Connection connection,
                                          ConnectionEntity entity,
                                          String database,
                                          SchemaDialectRegistry dialectRegistry) throws SQLException {
        String dbType = DbType.normalizeId(entity.getDbType());
        if (DbType.isCatalogSchemaFamily(dbType)) {
            return empty(database);
        }

        CatalogSchemaScope catalogSchema = CatalogSchemaScope.parse(database);
        String catalog = catalogSchema.catalog() != null && !catalogSchema.catalog().isBlank()
                ? catalogSchema.catalog()
                : TableMetadataSupport.resolveCatalog(connection, entity, database);
        SchemaScope scope = catalogSchema.hasSchema()
                ? dialectRegistry.resolve(dbType).resolveScope(connection, catalog, catalogSchema.schema())
                : dialectRegistry.resolve(dbType).resolveScope(connection, catalog);

        List<SchemaTableSummary> tables = DbType.isMysqlFamily(dbType)
                ? loadMysqlFamilyTables(connection, catalog)
                : loadGenericTables(connection.getMetaData(), scope);
        tables.sort(Comparator.comparing(SchemaTableSummary::tableName, String.CASE_INSENSITIVE_ORDER));
        return new SchemaTablesResult(database, tables);
    }

    private static List<SchemaTableSummary> loadMysqlFamilyTables(Connection connection, String catalog) throws SQLException {
        List<SchemaTableSummary> tables = new ArrayList<>();
        try (PreparedStatement ps = connection.prepareStatement("""
                SELECT TABLE_NAME, TABLE_ROWS, ENGINE, TABLE_COLLATION, DATA_LENGTH, CREATE_TIME, TABLE_COMMENT
                FROM information_schema.TABLES
                WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'
                ORDER BY TABLE_NAME
                """)) {
            ps.setString(1, catalog);
            try (ResultSet rs = ps.executeQuery()) {
                while (rs.next()) {
                    tables.add(mapMysqlRow(rs));
                }
            }
        }
        return tables;
    }

    private static SchemaTableSummary mapMysqlRow(ResultSet rs) throws SQLException {
        long rowCount = rs.getLong("TABLE_ROWS");
        Long rows = rs.wasNull() ? null : rowCount;
        long dataLength = rs.getLong("DATA_LENGTH");
        Long bytes = rs.wasNull() ? null : dataLength;
        Timestamp created = rs.getTimestamp("CREATE_TIME");
        return new SchemaTableSummary(
                rs.getString("TABLE_NAME"),
                rows,
                TableMetadataSupport.blankToNull(rs.getString("ENGINE")),
                TableMetadataSupport.blankToNull(rs.getString("TABLE_COLLATION")),
                bytes,
                created != null ? created.toInstant().toString() : null,
                TableMetadataSupport.blankToNull(rs.getString("TABLE_COMMENT")));
    }

    private static List<SchemaTableSummary> loadGenericTables(DatabaseMetaData meta, SchemaScope scope) throws SQLException {
        List<SchemaTableSummary> tables = new ArrayList<>();
        try (ResultSet rs = meta.getTables(scope.catalogPattern(), scope.schemaPattern(), "%", new String[]{"TABLE"})) {
            while (rs.next()) {
                String tableName = rs.getString("TABLE_NAME");
                if (tableName == null || tableName.isBlank()) {
                    continue;
                }
                tables.add(new SchemaTableSummary(
                        tableName,
                        null,
                        TableMetadataSupport.blankToNull(rs.getString("TABLE_TYPE")),
                        null,
                        null,
                        null,
                        TableMetadataSupport.blankToNull(rs.getString("REMARKS"))));
            }
        }
        return tables;
    }

    private static SchemaTablesResult empty(String database) {
        return new SchemaTablesResult(database, List.of());
    }
}
