package org.apache.datawise.backend.migration;

import org.apache.datawise.backend.jdbc.support.MigrationWhereSupport;
import org.apache.datawise.sqlparser.SqlTransformOps;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/** 迁移分页：稳定 ORDER BY 解析与 SQL 拼装（避免 OFFSET 重复读行）。 */
public final class MigrationOrderBySupport {

    private static final String COLUMN_NAME_PATTERN = "[A-Za-z0-9_$.]+";

    private MigrationOrderBySupport() {
    }

    public static List<String> resolveOrderByColumns(
                                                     List<String> explicit,
                                                     List<String> primaryKeyColumns,
                                                     String watermarkColumn,
                                                     String mode) {
        LinkedHashSet<String> resolved = new LinkedHashSet<>();
        if (explicit != null) {
            for (String column : explicit) {
                if (column != null && !column.isBlank()) {
                    resolved.add(column.trim());
                }
            }
        }
        if (resolved.isEmpty() && primaryKeyColumns != null) {
            for (String column : primaryKeyColumns) {
                if (column != null && !column.isBlank()) {
                    resolved.add(column.trim());
                }
            }
        }
        if ("INCR_APPEND".equalsIgnoreCase(normalizeMode(mode))
                && watermarkColumn != null
                && !watermarkColumn.isBlank()) {
            LinkedHashSet<String> withWatermarkFirst = new LinkedHashSet<>();
            withWatermarkFirst.add(watermarkColumn.trim());
            withWatermarkFirst.addAll(resolved);
            return List.copyOf(withWatermarkFirst);
        }
        return List.copyOf(resolved);
    }

    public static void validateOrderByColumns(List<String> orderByColumns) {
        if (orderByColumns == null) {
            return;
        }
        for (String column : orderByColumns) {
            if (column == null || column.isBlank()) {
                continue;
            }
            if (!column.trim().matches(COLUMN_NAME_PATTERN)) {
                throw new IllegalArgumentException("orderByColumns is invalid: " + column);
            }
        }
    }

    public static String buildSignatureSql(
                                           String baseSelectSql,
                                           String whereClause,
                                           String mode,
                                           String watermarkColumn,
                                           List<String> orderByColumns) {
        String sql = MigrationWhereSupport.appendWhere(baseSelectSql, whereClause);
        String normalizedMode = normalizeMode(mode);
        if ("INCR_APPEND".equals(normalizedMode)) {
            if (watermarkColumn == null || watermarkColumn.isBlank()) {
                throw new IllegalArgumentException("watermarkColumn is required for INCR_APPEND");
            }
            return sql + " /*INCR_APPEND watermark=" + watermarkColumn.trim()
                    + orderBySignatureSuffix(orderByColumns) + "*/";
        }
        String orderSuffix = orderBySignatureSuffix(orderByColumns);
        if (orderSuffix.isEmpty()) {
            return sql;
        }
        return sql + " /*" + orderSuffix.trim() + "*/";
    }

    public static String buildExecutionSql(
                                           String signatureSql,
                                           String mode,
                                           String watermarkColumn,
                                           String lastWatermark,
                                           List<String> orderByColumns) {
        String normalizedMode = normalizeMode(mode);
        if ("INCR_APPEND".equals(normalizedMode)) {
            if (watermarkColumn == null || watermarkColumn.isBlank()) {
                throw new IllegalArgumentException("watermarkColumn is required for INCR_APPEND");
            }
            String base = signatureSql;
            String predicate = watermarkColumn.trim() + " IS NOT NULL";
            if (lastWatermark != null && !lastWatermark.isBlank()) {
                predicate += " AND " + watermarkColumn.trim() + " > " + sqlLiteral(lastWatermark);
            }
            return appendOrderByAsc(SqlTransformOps.appendWhere(base, predicate), orderByColumns);
        }
        return appendOrderByAsc(signatureSql, orderByColumns);
    }

    /** 在已有 ORDER BY 的 SELECT 上追加 keyset 游标条件（严格大于上一页末行）。 */
    public static String appendKeysetSeek(String sql, List<String> orderByColumns, List<String> lastValues) {
        if (sql == null || sql.isBlank() || orderByColumns == null || orderByColumns.isEmpty()) {
            return sql;
        }
        if (lastValues == null || lastValues.isEmpty()) {
            return sql;
        }
        if (orderByColumns.size() != lastValues.size()) {
            throw new IllegalArgumentException("orderByColumns size mismatch with seek key");
        }
        return SqlTransformOps.appendKeysetSeek(sql, orderByColumns, lastValues);
    }

    public static List<String> extractSeekKey(List<Map<String, Object>> rows, List<String> orderByColumns) {
        return extractSeekKey(rows, orderByColumns, null);
    }

    /**
     * @param columnMeta {@link org.apache.datawise.backend.jdbc.support.ResultSetColumnMapper} 输出的列元数据
     *                   （{@code key}=c1, {@code name}=tenant_id），JDBC 行数据按 {@code c*} 存值。
     */
    public static List<String> extractSeekKey(
                                              List<Map<String, Object>> rows,
                                              List<String> orderByColumns,
                                              List<Map<String, Object>> columnMeta) {
        if (rows == null || rows.isEmpty() || orderByColumns == null || orderByColumns.isEmpty()) {
            return List.of();
        }
        Map<String, Object> lastRow = rows.get(rows.size() - 1);
        List<String> keys = new ArrayList<>(orderByColumns.size());
        for (String column : orderByColumns) {
            Object value = columnValue(lastRow, column, columnMeta);
            keys.add(value == null ? NULL_SEEK_SENTINEL : String.valueOf(value));
        }
        return List.copyOf(keys);
    }

    /** Encodes JDBC null for keyset seek; must match KeysetSeekHandler.NULL_SEEK_SENTINEL. */
    public static final String NULL_SEEK_SENTINEL = "\u0001DW_NULL\u0001";

    public static String encodeSeekKey(List<String> values) {
        if (values == null || values.isEmpty()) {
            return null;
        }
        StringBuilder json = new StringBuilder("[");
        for (int i = 0; i < values.size(); i++) {
            if (i > 0) {
                json.append(',');
            }
            json.append('"').append(escapeJson(values.get(i))).append('"');
        }
        return json.append(']').toString();
    }

    public static List<String> decodeSeekKey(String encoded) {
        if (encoded == null || encoded.isBlank()) {
            return List.of();
        }
        String trimmed = encoded.trim();
        if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) {
            return List.of();
        }
        String body = trimmed.substring(1, trimmed.length() - 1).trim();
        if (body.isEmpty()) {
            return List.of();
        }
        List<String> values = new ArrayList<>();
        StringBuilder current = new StringBuilder();
        boolean inString = false;
        boolean escaped = false;
        for (int i = 0; i < body.length(); i++) {
            char ch = body.charAt(i);
            if (!inString) {
                if (ch == '"') {
                    inString = true;
                }
                continue;
            }
            if (escaped) {
                current.append(ch);
                escaped = false;
                continue;
            }
            if (ch == '\\') {
                escaped = true;
                continue;
            }
            if (ch == '"') {
                values.add(current.toString());
                current.setLength(0);
                inString = false;
                continue;
            }
            current.append(ch);
        }
        return List.copyOf(values);
    }

    private static Object columnValue(
                                      Map<String, Object> row,
                                      String column,
                                      List<Map<String, Object>> columnMeta) {
        if (row.containsKey(column)) {
            return row.get(column);
        }
        for (Map.Entry<String, Object> entry : row.entrySet()) {
            if (entry.getKey() != null && entry.getKey().equalsIgnoreCase(column)) {
                return entry.getValue();
            }
        }
        String columnTail = column.contains(".") ? column.substring(column.lastIndexOf('.') + 1) : column;
        for (Map.Entry<String, Object> entry : row.entrySet()) {
            if (entry.getKey() != null && entry.getKey().equalsIgnoreCase(columnTail)) {
                return entry.getValue();
            }
        }
        if (columnMeta != null) {
            for (Map<String, Object> meta : columnMeta) {
                if (meta == null) {
                    continue;
                }
                Object name = meta.get("name");
                if (!(name instanceof String columnName)) {
                    continue;
                }
                if (!columnName.equalsIgnoreCase(column) && !columnName.equalsIgnoreCase(columnTail)) {
                    continue;
                }
                Object storageKey = meta.get("key");
                if (storageKey instanceof String key && row.containsKey(key)) {
                    return row.get(key);
                }
            }
        }
        return null;
    }

    private static String escapeJson(String value) {
        if (value == null) {
            return "";
        }
        return value
                .replace("\\", "\\\\")
                .replace("\"", "\\\"");
    }

    public static String appendOrderByAsc(String sql, List<String> columns) {
        return SqlTransformOps.appendOrderByAsc(sql, columns);
    }

    private static String orderBySignatureSuffix(List<String> orderByColumns) {
        if (orderByColumns == null || orderByColumns.isEmpty()) {
            return "";
        }
        return " ORDER BY=" + String.join(",", orderByColumns);
    }

    private static String normalizeMode(String mode) {
        return mode == null || mode.isBlank() ? "FULL_APPEND" : mode.trim().toUpperCase(Locale.ROOT);
    }

    private static String sqlLiteral(String value) {
        if (value == null) {
            return "NULL";
        }
        return "'" + value.replace("\\", "\\\\").replace("'", "''") + "'";
    }
}
