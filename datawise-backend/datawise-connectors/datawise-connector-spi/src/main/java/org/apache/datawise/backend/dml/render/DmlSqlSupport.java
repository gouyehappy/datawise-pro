package org.apache.datawise.backend.dml.render;

import java.time.temporal.TemporalAccessor;
import java.util.HexFormat;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

/** DML 渲染通用 SQL 片段工具。 */
public final class DmlSqlSupport {

    private DmlSqlSupport() {
    }

    public static String sanitizeIdentifier(String name) {
        return name.replace("`", "").replace("\"", "");
    }

    public static String sqlLiteral(Object value) {
        if (value == null) {
            return "NULL";
        }
        if (value instanceof Number || value instanceof Boolean) {
            return String.valueOf(value);
        }
        if (value instanceof byte[] bytes) {
            return binaryLiteralAnsi(bytes);
        }
        if (value instanceof java.util.Date date) {
            return "'" + escapeSqlString(new java.text.SimpleDateFormat("yyyy-MM-dd HH:mm:ss").format(date)) + "'";
        }
        if (value instanceof TemporalAccessor) {
            return "'" + escapeSqlString(String.valueOf(value)) + "'";
        }
        return "'" + escapeSqlString(String.valueOf(value)) + "'";
    }

    /** ANSI / MySQL / H2 / SQLite / Oracle style: {@code X'ABCD'}. */
    public static String binaryLiteralAnsi(byte[] bytes) {
        if (bytes == null) {
            return "NULL";
        }
        return "X'" + HexFormat.of().withUpperCase().formatHex(bytes) + "'";
    }

    /** PostgreSQL family: {@code '\xabcd'::bytea}. */
    public static String binaryLiteralPostgres(byte[] bytes) {
        if (bytes == null) {
            return "NULL";
        }
        return "'\\x" + HexFormat.of().formatHex(bytes) + "'::bytea";
    }

    /** SQL Server / Sybase: {@code 0xABCD}. */
    public static String binaryLiteralSqlServer(byte[] bytes) {
        if (bytes == null) {
            return "NULL";
        }
        return "0x" + HexFormat.of().withUpperCase().formatHex(bytes);
    }

    /**
     * Escapes string literals for dialects that treat {@code \} as an escape (MySQL family default).
     * Order: backslash first, then single quote — otherwise {@code abc\}'} can break out of quotes.
     */
    static String escapeSqlString(String value) {
        if (value == null) {
            return "";
        }
        return value.replace("\\", "\\\\").replace("'", "''");
    }

    /** 拼装 {@code col = val AND ...} 等值条件。 */
    public static String buildWhereEquals(Function<String, String> quoteFn, Map<String, Object> values) {
        return buildWhereEquals(quoteFn, values, DmlSqlSupport::sqlLiteral);
    }

    public static String buildWhereEquals(
                                          Function<String, String> quoteFn,
                                          Map<String, Object> values,
                                          Function<Object, String> literalFn) {
        return values.entrySet().stream()
                .map(entry -> quoteFn.apply(entry.getKey()) + " = " + literalFn.apply(entry.getValue()))
                .collect(Collectors.joining(" AND "));
    }
}
