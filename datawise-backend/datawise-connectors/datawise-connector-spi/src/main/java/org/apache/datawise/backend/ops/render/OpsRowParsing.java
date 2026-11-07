package org.apache.datawise.backend.ops.render;

import java.util.List;
import java.util.Locale;
import java.util.Map;

/** 运维 SQL 结果集行解析工具。 */
public final class OpsRowParsing {

    private OpsRowParsing() {
    }

    public static Object cell(Map<String, Object> row, List<Map<String, Object>> columns, String... names) {
        for (String name : names) {
            String key = columnKey(columns, name);
            if (key != null && row.containsKey(key)) {
                return row.get(key);
            }
        }
        return null;
    }

    public static String columnKey(List<Map<String, Object>> columns, String name) {
        String target = name.toLowerCase(Locale.ROOT);
        for (Map<String, Object> column : columns) {
            Object label = column.get("name");
            if (label != null && label.toString().toLowerCase(Locale.ROOT).equals(target)) {
                Object key = column.get("key");
                return key != null ? key.toString() : null;
            }
        }
        return null;
    }

    public static String asString(Object value) {
        if (value == null) {
            return "";
        }
        return value.toString().trim();
    }

    public static long asLong(Object value) {
        if (value == null) {
            return 0L;
        }
        if (value instanceof Number number) {
            return number.longValue();
        }
        try {
            return Long.parseLong(value.toString().trim());
        } catch (NumberFormatException ex) {
            return 0L;
        }
    }
}
