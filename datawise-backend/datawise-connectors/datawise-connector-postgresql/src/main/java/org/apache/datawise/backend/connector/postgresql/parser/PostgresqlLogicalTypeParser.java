package org.apache.datawise.backend.connector.postgresql.parser;

import org.apache.datawise.backend.common.DbType;
import org.apache.datawise.backend.ddl.spi.LogicalTypeParser;
import org.apache.datawise.backend.metadata.LogicalType;
import org.apache.datawise.backend.metadata.LogicalTypeKind;

import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** PostgreSQL 族物理类型 → {@link LogicalType}（udt_name / information_schema 格式）。 */
public class PostgresqlLogicalTypeParser implements LogicalTypeParser {

    private static final Pattern TYPE_WITH_ARGS =
            Pattern.compile("^([a-z][a-z0-9_ ]*?)(?:\\((.+)\\))?$", Pattern.CASE_INSENSITIVE);

    @Override
    public boolean supports(String dbType) {
        return DbType.isPostgresqlFamily(dbType);
    }

    @Override
    public int priority() {
        return 20;
    }

    @Override
    public LogicalType parse(String physicalType) {
        if (physicalType == null || physicalType.isBlank()) {
            return LogicalType.unknown("text");
        }
        String trimmed = physicalType.trim();
        Matcher matcher = TYPE_WITH_ARGS.matcher(trimmed.toLowerCase(Locale.ROOT));
        if (matcher.matches()) {
            String base = matcher.group(1).trim().replace(' ', '_');
            String args = matcher.group(2);
            Integer length = parseFirstInt(args);
            Integer precision = null;
            Integer scale = null;
            if (args != null && args.contains(",")) {
                String[] parts = args.split(",");
                precision = parseInt(parts[0].trim());
                scale = parts.length > 1 ? parseInt(parts[1].trim()) : null;
                length = null;
            }
            return fromUdt(base, length, precision, scale);
        }
        return fromUdt(trimmed.toLowerCase(Locale.ROOT), null, null, null);
    }

    public static LogicalType fromUdt(String udtName, Integer charLen, Integer precision, Integer scale) {
        if (udtName == null || udtName.isBlank()) {
            return LogicalType.unknown("text");
        }
        String normalized = udtName.toLowerCase(Locale.ROOT);
        return switch (normalized) {
            case "int2", "smallint" -> logical(LogicalTypeKind.SMALLINT, normalized);
            case "int4", "integer" -> logical(LogicalTypeKind.INTEGER, normalized);
            case "int8", "bigint" -> logical(LogicalTypeKind.BIGINT, normalized);
            case "bool", "boolean" -> logical(LogicalTypeKind.BOOLEAN, normalized);
            case "varchar", "character_varying" -> new LogicalType(LogicalTypeKind.VARCHAR, charLen, null, null, false, normalized, Map.of());
            case "bpchar", "character" -> new LogicalType(LogicalTypeKind.CHAR, charLen, null, null, false, normalized, Map.of());
            case "text" -> logical(LogicalTypeKind.TEXT, normalized);
            case "numeric", "decimal" -> new LogicalType(LogicalTypeKind.DECIMAL, null, precision, scale, false, normalized, Map.of());
            case "timestamp", "timestamptz" -> logical(LogicalTypeKind.TIMESTAMP, normalized);
            case "date" -> logical(LogicalTypeKind.DATE, normalized);
            case "time", "timetz" -> logical(LogicalTypeKind.TIME, normalized);
            case "json", "jsonb" -> logical(LogicalTypeKind.JSON, normalized);
            case "uuid" -> logical(LogicalTypeKind.UUID, normalized);
            default -> LogicalType.unknown(normalized);
        };
    }

    private static LogicalType logical(LogicalTypeKind kind, String raw) {
        return new LogicalType(kind, null, null, null, false, raw, Map.of());
    }

    private static Integer parseFirstInt(String args) {
        if (args == null || args.isBlank() || args.contains(",")) {
            return null;
        }
        return parseInt(args.trim());
    }

    private static Integer parseInt(String value) {
        try {
            return Integer.parseInt(value);
        } catch (NumberFormatException ex) {
            return null;
        }
    }
}
