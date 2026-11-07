package org.apache.datawise.backend.connector.kylin.support;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.connector.api.support.TableMetadataSupport;
import org.apache.datawise.backend.domain.TableColumnDetail;

import java.sql.Connection;
import java.sql.DatabaseMetaData;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.List;

/** Apache Kylin JDBC metadata helpers (project-scoped tables and columns). */
public final class KylinMetadataSupport {

    public static final String DEFAULT_PROJECT = "learn_kylin";

    private KylinMetadataSupport() {
    }

    public static String resolveProject(Connection connection) throws SQLException {
        String catalog = connection.getCatalog();
        if (catalog != null && !catalog.isBlank()) {
            return catalog.trim();
        }
        String schema = connection.getSchema();
        if (schema != null && !schema.isBlank()) {
            return schema.trim();
        }
        return DEFAULT_PROJECT;
    }

    public static List<String> listTables(Connection connection) throws SQLException {
        List<String> tables = new ArrayList<>();
        DatabaseMetaData meta = connection.getMetaData();
        try (ResultSet rs = meta.getTables(null, null, "%", new String[]{"TABLE"})) {
            while (rs.next()) {
                String tableName = rs.getString("TABLE_NAME");
                if (tableName != null && !tableName.isBlank()) {
                    tables.add(tableName.trim());
                }
            }
        }
        return tables;
    }

    public static List<TableColumnDetail> loadColumns(Connection connection, String tableName) throws SQLException {
        List<TableColumnDetail> columns = new ArrayList<>();
        DatabaseMetaData meta = connection.getMetaData();
        try (ResultSet rs = meta.getColumns(null, null, tableName, "%")) {
            while (rs.next()) {
                columns.add(new TableColumnDetail(
                        rs.getInt("ORDINAL_POSITION"),
                        rs.getString("COLUMN_NAME"),
                        rs.getString("TYPE_NAME"),
                        rs.getInt("NULLABLE") != DatabaseMetaData.columnNoNulls,
                        "YES".equalsIgnoreCase(rs.getString("IS_AUTOINCREMENT")),
                        null,
                        TableMetadataSupport.blankToNull(rs.getString("COLUMN_DEF")),
                        null,
                        TableMetadataSupport.blankToNull(rs.getString("REMARKS"))
                ));
            }
        }
        return columns;
    }

    public static String quoteQualifiedTable(String database, String tableName) {
        return DbType.KYLIN.quoteName(tableName);
    }
}
