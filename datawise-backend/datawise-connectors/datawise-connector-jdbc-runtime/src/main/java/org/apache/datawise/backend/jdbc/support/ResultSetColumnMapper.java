package org.apache.datawise.backend.jdbc.support;

import java.sql.ResultSet;
import java.sql.ResultSetMetaData;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * JDBC 结果集列映射：JOIN / SELECT * 时列名会重复，行数据必须用唯一 key 存储。
 */
public final class ResultSetColumnMapper {

    public record ColumnField(String key, String name, String type) {
    }

    private ResultSetColumnMapper() {
    }

    public static List<ColumnField> buildFields(ResultSetMetaData meta) throws SQLException {
        int columnCount = meta.getColumnCount();
        List<ColumnField> fields = new ArrayList<>(columnCount);
        Map<String, Integer> labelCounts = new HashMap<>();

        for (int i = 1; i <= columnCount; i++) {
            String label = meta.getColumnLabel(i);
            if (label == null || label.isBlank()) {
                label = "column_" + i;
            }
            int occurrence = labelCounts.merge(label.toLowerCase(Locale.ROOT), 1, Integer::sum);
            String displayName = label;
            if (occurrence > 1) {
                String table = meta.getTableName(i);
                if (table != null && !table.isBlank()) {
                    displayName = table + "." + label;
                } else {
                    displayName = label + "_" + occurrence;
                }
            }
            fields.add(new ColumnField("c" + i, displayName, meta.getColumnTypeName(i)));
        }
        return fields;
    }

    public static Map<String, Object> readRow(ResultSet rs, List<ColumnField> fields) throws SQLException {
        return readRow(rs, fields, false);
    }

    /**
     * @param preserveForMigration when true, use {@link JdbcCellValues#forMigration} (no UI truncation).
     */
    public static Map<String, Object> readRow(ResultSet rs, List<ColumnField> fields, boolean preserveForMigration)
            throws SQLException {
        Map<String, Object> row = new LinkedHashMap<>();
        for (int i = 0; i < fields.size(); i++) {
            Object raw = rs.getObject(i + 1);
            row.put(
                    fields.get(i).key(),
                    preserveForMigration ? JdbcCellValues.forMigration(raw) : JdbcCellValues.normalize(raw)
            );
        }
        return row;
    }

    public static List<Map<String, Object>> toColumnMaps(List<ColumnField> fields) {
        List<Map<String, Object>> columns = new ArrayList<>(fields.size());
        for (ColumnField field : fields) {
            Map<String, Object> column = new LinkedHashMap<>();
            column.put("key", field.key());
            column.put("name", field.name());
            column.put("type", field.type());
            columns.add(column);
        }
        return columns;
    }
}
