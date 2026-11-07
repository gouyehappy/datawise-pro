package org.apache.datawise.backend.connector.elasticsearch.support;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.connector.api.support.TableMetadataSupport;
import org.apache.datawise.backend.domain.TableColumnDetail;

import java.sql.Connection;
import java.sql.DatabaseMetaData;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/** Elasticsearch SQL JDBC metadata helpers (indices as tables, DESCRIBE for columns). */
public final class ElasticsearchMetadataSupport {

    /** Synthetic Explorer namespace when the cluster exposes no JDBC catalogs. */
    public static final String DEFAULT_NAMESPACE = "elasticsearch";

    private ElasticsearchMetadataSupport() {
    }

    public static boolean isSystemIndex(String indexName) {
        return indexName == null || indexName.isBlank() || indexName.startsWith(".");
    }

    public static List<String> listIndices(Connection connection) throws SQLException {
        LinkedHashSet<String> indices = new LinkedHashSet<>();
        appendShowTables(connection, indices);
        if (!indices.isEmpty()) {
            return List.copyOf(indices);
        }
        appendMetadataTables(connection.getMetaData(), indices);
        return List.copyOf(indices);
    }

    public static List<TableColumnDetail> loadColumns(Connection connection, String indexName) throws SQLException {
        List<TableColumnDetail> columns = loadColumnsViaDescribe(connection, indexName);
        if (!columns.isEmpty()) {
            return columns;
        }
        return loadColumnsViaMetadata(connection.getMetaData(), indexName);
    }

    public static String quoteQualifiedTable(String database, String tableName) {
        return DbType.ELASTICSEARCH.quoteName(tableName);
    }

    private static void appendShowTables(Connection connection, Set<String> indices) throws SQLException {
        try (Statement statement = connection.createStatement();
             ResultSet rs = statement.executeQuery("SHOW TABLES")) {
            while (rs.next()) {
                String index = readString(rs, "name", "table", 1);
                if (!isSystemIndex(index)) {
                    indices.add(index);
                }
            }
        } catch (SQLException ignored) {
            // Fall back to JDBC metadata.
        }
    }

    private static void appendMetadataTables(DatabaseMetaData meta, Set<String> indices) throws SQLException {
        try (ResultSet rs = meta.getTables(null, null, "%", new String[]{"TABLE"})) {
            while (rs.next()) {
                String index = rs.getString("TABLE_NAME");
                if (!isSystemIndex(index)) {
                    indices.add(index);
                }
            }
        }
    }

    private static List<TableColumnDetail> loadColumnsViaDescribe(Connection connection, String indexName)
            throws SQLException {
        String sql = "DESCRIBE " + DbType.ELASTICSEARCH.quoteName(indexName);
        List<TableColumnDetail> columns = new ArrayList<>();
        try (Statement statement = connection.createStatement();
             ResultSet rs = statement.executeQuery(sql)) {
            int ordinal = 0;
            while (rs.next()) {
                ordinal++;
                String name = readString(rs, "column", "name", 1);
                String type = readString(rs, "type", 2);
                columns.add(new TableColumnDetail(
                        ordinal,
                        name,
                        type,
                        true,
                        false,
                        null,
                        null,
                        null,
                        null
                ));
            }
        } catch (SQLException ignored) {
            return List.of();
        }
        return columns;
    }

    private static List<TableColumnDetail> loadColumnsViaMetadata(DatabaseMetaData meta, String indexName)
            throws SQLException {
        List<TableColumnDetail> columns = new ArrayList<>();
        try (ResultSet rs = meta.getColumns(null, null, indexName, "%")) {
            while (rs.next()) {
                columns.add(new TableColumnDetail(
                        rs.getInt("ORDINAL_POSITION"),
                        rs.getString("COLUMN_NAME"),
                        rs.getString("TYPE_NAME"),
                        "YES".equalsIgnoreCase(rs.getString("IS_NULLABLE")),
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

    private static String readString(ResultSet rs, String primaryColumn, String fallbackColumn, int position)
            throws SQLException {
        String value = readString(rs, primaryColumn, position);
        if (value != null) {
            return value;
        }
        return readString(rs, fallbackColumn, position);
    }

    private static String readString(ResultSet rs, String column, int position) throws SQLException {
        try {
            String value = rs.getString(column);
            if (value != null && !value.isBlank()) {
                return value.trim();
            }
        } catch (SQLException ignored) {
            // Column label may differ between driver versions.
        }
        String value = rs.getString(position);
        return value == null || value.isBlank() ? null : value.trim();
    }
}
