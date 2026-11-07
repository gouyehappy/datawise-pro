package org.apache.datawise.backend.ddl.parser;

import org.apache.datawise.backend.ddl.spi.LogicalTypeParser;
import org.apache.datawise.backend.metadata.LogicalType;
import org.apache.datawise.backend.metadata.LogicalTypeKind;
import org.springframework.stereotype.Component;

import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** 通用物理类型解析器（JDBC / information_schema 字符串），作为兜底。 */
@Component
public class DefaultLogicalTypeParser implements LogicalTypeParser {

    private static final Pattern TYPE_WITH_ARGS =
            Pattern.compile("^([a-z][a-z0-9_ ]*?)(?:\\((.+)\\))?(\\s+unsigned)?$", Pattern.CASE_INSENSITIVE);

    @Override
    public boolean supports(String dbType) {
        return true;
    }

    @Override
    public int priority() {
        return 10_000;
    }

    @Override
    public LogicalType parse(String physicalType) {
        if (physicalType == null || physicalType.isBlank()) {
            return LogicalType.unknown("text");
        }
        String trimmed = physicalType.trim().toLowerCase(Locale.ROOT);
        if (trimmed.startsWith("enum(") || trimmed.startsWith("set(")) {
            LogicalTypeKind kind = trimmed.startsWith("enum(") ? LogicalTypeKind.ENUM : LogicalTypeKind.SET;
            return new LogicalType(kind, null, null, null, false, physicalType.trim(), Map.of("raw", physicalType.trim()));
        }

        Matcher matcher = TYPE_WITH_ARGS.matcher(trimmed);
        if (!matcher.matches()) {
            return LogicalType.unknown(physicalType.trim());
        }

        String base = matcher.group(1).trim().replace(' ', '_');
        String args = matcher.group(2);
        boolean unsigned = matcher.group(3) != null;

        return switch (base) {
            case "tinyint" -> new LogicalType(LogicalTypeKind.TINYINT, parseFirstInt(args), null, null, unsigned, base, Map.of());
            case "smallint", "int2" -> new LogicalType(LogicalTypeKind.SMALLINT, null, null, null, unsigned, base, Map.of());
            case "mediumint", "int", "integer", "int4" ->
                new LogicalType(LogicalTypeKind.INTEGER, parseFirstInt(args), null, null, unsigned, base, Map.of());
            case "bigint", "int8" -> new LogicalType(LogicalTypeKind.BIGINT, parseFirstInt(args), null, null, unsigned, base, Map.of());
            case "float", "real" -> new LogicalType(LogicalTypeKind.FLOAT, null, null, null, unsigned, base, Map.of());
            case "double", "double_precision", "float8" ->
                new LogicalType(LogicalTypeKind.DOUBLE, null, null, null, unsigned, base, Map.of());
            case "decimal", "numeric", "number" -> parseDecimal(args, base, unsigned);
            case "char", "bpchar", "character" -> new LogicalType(LogicalTypeKind.CHAR, parseFirstInt(args), null, null, false, base, Map.of());
            case "varchar", "character_varying" ->
                new LogicalType(LogicalTypeKind.VARCHAR, parseFirstInt(args), null, null, false, base, Map.of());
            case "text", "tinytext", "mediumtext", "longtext", "clob" ->
                new LogicalType(LogicalTypeKind.TEXT, null, null, null, false, base, Map.of());
            case "binary", "varbinary", "blob", "tinyblob", "mediumblob", "longblob", "bytea" ->
                new LogicalType(LogicalTypeKind.BLOB, null, null, null, false, base, Map.of());
            case "date" -> new LogicalType(LogicalTypeKind.DATE, null, null, null, false, base, Map.of());
            case "time", "timetz" -> new LogicalType(LogicalTypeKind.TIME, null, null, null, false, base, Map.of());
            case "datetime" -> new LogicalType(LogicalTypeKind.DATETIME, null, null, null, false, base, Map.of());
            case "timestamp", "timestamptz", "datetime2" ->
                new LogicalType(LogicalTypeKind.TIMESTAMP, null, null, null, false, base, Map.of());
            case "json", "jsonb" -> new LogicalType(LogicalTypeKind.JSON, null, null, null, false, base, Map.of());
            case "bool", "boolean" -> new LogicalType(LogicalTypeKind.BOOLEAN, null, null, null, false, base, Map.of());
            case "uuid" -> new LogicalType(LogicalTypeKind.UUID, null, null, null, false, base, Map.of());
            default -> LogicalType.unknown(physicalType.trim());
        };
    }

    private static LogicalType parseDecimal(String args, String base, boolean unsigned) {
        if (args == null || args.isBlank()) {
            return new LogicalType(LogicalTypeKind.DECIMAL, null, null, null, unsigned, base, Map.of());
        }
        String[] parts = args.split(",");
        Integer precision = parseInt(parts[0].trim());
        Integer scale = parts.length > 1 ? parseInt(parts[1].trim()) : null;
        return new LogicalType(LogicalTypeKind.DECIMAL, null, precision, scale, unsigned, base, Map.of());
    }

    private static Integer parseFirstInt(String args) {
        if (args == null || args.isBlank()) {
            return null;
        }
        return parseInt(args.split(",")[0].trim());
    }

    private static Integer parseInt(String value) {
        try {
            return Integer.parseInt(value);
        } catch (NumberFormatException ex) {
            return null;
        }
    }
}
