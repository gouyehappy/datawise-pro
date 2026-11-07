package org.apache.datawise.backend.jdbc.support;

import java.math.BigDecimal;
import java.math.BigInteger;
import java.sql.Array;
import java.sql.Blob;
import java.sql.Clob;
import java.sql.Date;
import java.sql.SQLException;
import java.sql.SQLXML;
import java.sql.Time;
import java.sql.Timestamp;
import java.time.temporal.TemporalAccessor;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 将 JDBC {@code ResultSet#getObject} 返回值规范为 JSON 可序列化、前端可展示的标量或结构。
 */
public final class JdbcCellValues {

    /** Cap binary preview so wide BLOB columns do not explode JSON / heap on large result pages. */
    public static final int MAX_BYTES_HEX = 4096;

    /** Cap text preview for CLOB / SQLXML / oversized strings. */
    public static final int MAX_TEXT_CHARS = 4096;

    /** Cap elements in JDBC arrays / lists / maps returned as cell values. */
    public static final int MAX_COLLECTION_ELEMENTS = 256;

    /** Cap nesting depth for nested Map / List / Array structures. */
    public static final int MAX_NESTING_DEPTH = 8;

    /**
     * Absolute safety cap for ordinary {@link String} cells (not CLOB). Prevents multi-MB VARCHAR/JSON
     * from blowing up API payloads while still allowing typical wide columns.
     */
    public static final int MAX_STRING_CHARS = 1_048_576;

    /**
     * JavaScript {@code Number.MAX_SAFE_INTEGER}. Values outside this range must be strings in JSON
     * or the browser collapses distinct snowflake / bigint ids to the same number.
     */
    public static final long JS_MAX_SAFE_INTEGER = 9007199254740991L;

    private static final char[] HEX = "0123456789abcdef".toCharArray();

    private JdbcCellValues() {
    }

    public static Object normalize(Object value) {
        return normalize(value, 0);
    }

    /**
     * Preserve JDBC cell values for data-copy paths (migration). Unlike {@link #normalize},
     * does not truncate binary/text or rewrite timestamps / bigints for JSON/UI display.
     */
    public static Object forMigration(Object value) {
        if (value == null) {
            return null;
        }
        if (value instanceof byte[] bytes) {
            return bytes;
        }
        if (value instanceof Blob blob) {
            return readBlobBytes(blob);
        }
        if (value instanceof Clob clob) {
            return readClobFull(clob);
        }
        if (value instanceof SQLXML xml) {
            try {
                return xml.getString();
            } catch (SQLException ex) {
                return null;
            }
        }
        if (value instanceof Array array) {
            try {
                Object raw = array.getArray();
                if (raw instanceof Object[] values) {
                    List<Object> items = new ArrayList<>(values.length);
                    for (Object item : values) {
                        items.add(forMigration(item));
                    }
                    return items;
                }
                return raw;
            } catch (SQLException ex) {
                return null;
            }
        }
        // Timestamp / Date / Time / Number / String / Boolean — pass through for setObject.
        return value;
    }

    private static byte[] readBlobBytes(Blob blob) {
        try {
            long length = blob.length();
            if (length <= 0) {
                return new byte[0];
            }
            if (length > Integer.MAX_VALUE) {
                throw new SQLException("BLOB too large for in-memory migration: " + length);
            }
            return blob.getBytes(1, (int) length);
        } catch (SQLException ex) {
            return null;
        }
    }

    private static String readClobFull(Clob clob) {
        try {
            long length = clob.length();
            if (length <= 0) {
                return "";
            }
            if (length > Integer.MAX_VALUE) {
                throw new SQLException("CLOB too large for in-memory migration: " + length);
            }
            return clob.getSubString(1, (int) length);
        } catch (SQLException ex) {
            return null;
        }
    }

    private static Object normalize(Object value, int depth) {
        if (value == null) {
            return null;
        }
        if (depth > MAX_NESTING_DEPTH) {
            return "…(max depth " + MAX_NESTING_DEPTH + ")";
        }
        if (value instanceof String text) {
            return truncateText(text, MAX_STRING_CHARS);
        }
        if (value instanceof Boolean) {
            return value;
        }
        if (value instanceof Number number) {
            return normalizeNumber(number);
        }
        if (value instanceof byte[] bytes) {
            return bytesToHex(bytes, bytes.length);
        }
        if (value instanceof Blob blob) {
            return readBlob(blob);
        }
        if (value instanceof Timestamp timestamp) {
            return timestamp.toInstant().toString();
        }
        if (value instanceof Date sqlDate) {
            return sqlDate.toLocalDate().toString();
        }
        if (value instanceof Time sqlTime) {
            return sqlTime.toLocalTime().toString();
        }
        if (value instanceof TemporalAccessor temporal) {
            return temporal.toString();
        }
        if (value instanceof java.util.Date date) {
            return date.toInstant().toString();
        }
        if (value instanceof Clob clob) {
            return readClob(clob);
        }
        if (value instanceof SQLXML xml) {
            return readSqlXml(xml);
        }
        if (value instanceof Array array) {
            return normalizeArray(array, depth);
        }
        String pgObjectValue = readPgObjectValue(value);
        if (pgObjectValue != null) {
            return truncateText(pgObjectValue, MAX_STRING_CHARS);
        }
        if (value instanceof Map<?, ?> map) {
            return normalizeMap(map, depth);
        }
        if (value instanceof List<?> list) {
            return normalizeList(list, depth);
        }
        if (value.getClass().isArray()) {
            return normalizeObjectArray(value, depth);
        }
        return truncateText(String.valueOf(value), MAX_STRING_CHARS);
    }

    /**
     * Keep small integers/floats as JSON numbers; stringify values that JS cannot represent exactly.
     */
    static Object normalizeNumber(Number value) {
        if (value instanceof BigInteger bigInteger) {
            return bigInteger.toString();
        }
        if (value instanceof BigDecimal bigDecimal) {
            // Always plain string: JSON numbers cannot preserve arbitrary decimal precision.
            return bigDecimal.toPlainString();
        }
        if (value instanceof Long longValue) {
            return isJsSafeInteger(longValue) ? longValue : Long.toString(longValue);
        }
        if (value instanceof Integer || value instanceof Short || value instanceof Byte) {
            return value;
        }
        if (value instanceof Float || value instanceof Double) {
            return value;
        }
        // Driver-specific Number subclasses (e.g. unsigned) — prefer exact decimal text.
        try {
            BigDecimal asDecimal = new BigDecimal(value.toString());
            if (asDecimal.scale() <= 0
                    && asDecimal.compareTo(BigDecimal.valueOf(JS_MAX_SAFE_INTEGER)) <= 0
                    && asDecimal.compareTo(BigDecimal.valueOf(-JS_MAX_SAFE_INTEGER)) >= 0) {
                return asDecimal.longValueExact();
            }
            return asDecimal.toPlainString();
        } catch (NumberFormatException | ArithmeticException ex) {
            return value.toString();
        }
    }

    static boolean isJsSafeInteger(long value) {
        return value >= -JS_MAX_SAFE_INTEGER && value <= JS_MAX_SAFE_INTEGER;
    }

    private static String readPgObjectValue(Object value) {
        if (!"org.postgresql.util.PGobject".equals(value.getClass().getName())) {
            return null;
        }
        try {
            Object raw = value.getClass().getMethod("getValue").invoke(value);
            return raw != null ? raw.toString() : null;
        } catch (ReflectiveOperationException ex) {
            return null;
        }
    }

    private static List<Object> normalizeArray(Array array, int depth) {
        try {
            Object raw = array.getArray();
            if (raw instanceof Object[] values) {
                return normalizeList(List.of(values), depth);
            }
            return List.of(String.valueOf(raw));
        } catch (SQLException ex) {
            return List.of();
        }
    }

    private static List<Object> normalizeObjectArray(Object value, int depth) {
        int length = java.lang.reflect.Array.getLength(value);
        int limit = Math.min(length, MAX_COLLECTION_ELEMENTS);
        List<Object> items = new ArrayList<>(limit);
        for (int i = 0; i < limit; i++) {
            items.add(normalize(java.lang.reflect.Array.get(value, i), depth + 1));
        }
        if (length > MAX_COLLECTION_ELEMENTS) {
            items.add("…(" + length + " items)");
        }
        return items;
    }

    private static Map<String, Object> normalizeMap(Map<?, ?> map, int depth) {
        Map<String, Object> normalized = new LinkedHashMap<>();
        int count = 0;
        for (Map.Entry<?, ?> entry : map.entrySet()) {
            if (count >= MAX_COLLECTION_ELEMENTS) {
                normalized.put("…", "(" + map.size() + " entries)");
                break;
            }
            normalized.put(String.valueOf(entry.getKey()), normalize(entry.getValue(), depth + 1));
            count++;
        }
        return normalized;
    }

    private static List<Object> normalizeList(List<?> list, int depth) {
        int limit = Math.min(list.size(), MAX_COLLECTION_ELEMENTS);
        List<Object> normalized = new ArrayList<>(limit + (list.size() > MAX_COLLECTION_ELEMENTS ? 1 : 0));
        for (int i = 0; i < limit; i++) {
            normalized.add(normalize(list.get(i), depth + 1));
        }
        if (list.size() > MAX_COLLECTION_ELEMENTS) {
            normalized.add("…(" + list.size() + " items)");
        }
        return normalized;
    }

    private static String readBlob(Blob blob) {
        try {
            long length = blob.length();
            if (length <= 0) {
                return "";
            }
            int readLength = (int) Math.min(length, MAX_BYTES_HEX);
            byte[] bytes = blob.getBytes(1, readLength);
            return bytesToHex(bytes, length);
        } catch (SQLException ex) {
            return "";
        }
    }

    private static String readClob(Clob clob) {
        try {
            long length = clob.length();
            if (length <= 0) {
                return "";
            }
            int readLength = (int) Math.min(length, MAX_TEXT_CHARS);
            String text = clob.getSubString(1, readLength);
            if (length > MAX_TEXT_CHARS) {
                return text + "…(" + length + " chars)";
            }
            return text;
        } catch (SQLException ex) {
            return "";
        }
    }

    private static String readSqlXml(SQLXML xml) {
        try {
            return truncateText(xml.getString(), MAX_TEXT_CHARS);
        } catch (SQLException ex) {
            return "";
        }
    }

    private static String truncateText(String value, int maxLen) {
        if (value == null) {
            return "";
        }
        if (value.length() <= maxLen) {
            return value;
        }
        return value.substring(0, maxLen) + "…(" + value.length() + " chars)";
    }

    private static String bytesToHex(byte[] bytes, long totalLength) {
        int len = Math.min(bytes.length, MAX_BYTES_HEX);
        boolean truncated = totalLength > MAX_BYTES_HEX;
        StringBuilder sb = new StringBuilder(len * 2 + (truncated ? 32 : 0));
        for (int i = 0; i < len; i++) {
            int value = bytes[i] & 0xff;
            sb.append(HEX[value >>> 4]);
            sb.append(HEX[value & 0x0f]);
        }
        if (truncated) {
            sb.append("…(").append(totalLength).append(" bytes)");
        }
        return sb.toString();
    }
}
