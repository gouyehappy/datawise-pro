package org.apache.datawise.datagen.type;

import org.apache.datawise.datagen.type.base.IGenerator;

/**
 * 将“SQL 类型字符串”映射到对应的字段值生成器。
 *
 * <p>注意：这里的输入是 {@code TableColumnDetail.dataType}（通常形如 varchar(32)/decimal(10,2)/timestamp 等）。</p>
 */
public final class TypeGeneratorRegistry {

    private TypeGeneratorRegistry() {
    }

    public static IGenerator<?> resolve(String sqlType, String fieldName) {
        String normalized = sqlType == null ? "" : sqlType.trim().toLowerCase();
        if (normalized.isBlank()) {
            return new StringGenerator(null);
        }

        String baseType = extractBaseType(normalized);
        int length = extractLengthOrMinusOne(normalized);

        if (baseType.contains("char")
                || baseType.contains("text")
                || baseType.contains("clob")
                || baseType.contains("varchar")
                || baseType.contains("string")
                || baseType.contains("uuid")) {
            int safeLen = length >= 0 ? Math.min(length, 255) : 10;
            return new StringGenerator(safeLen);
        }

        if (baseType.contains("json")) {
            return new JsonStringGenerator();
        }

        if (baseType.contains("tinyint")) return new ByteGenerator();
        if (baseType.contains("smallint")) return new ShortGenerator();
        if (baseType.equals("int") || baseType.contains("integer") || baseType.contains("serial")) return new IntegerGenerator();
        if (baseType.contains("bigint")) return new LongGenerator();

        if (baseType.contains("float")) return new FloatGenerator();
        if (baseType.contains("double") || baseType.contains("real")) return new DoubleGenerator();
        if (baseType.contains("decimal") || baseType.contains("numeric")) return new BigDecimalGenerator();

        if (baseType.contains("bool") || baseType.contains("boolean") || baseType.startsWith("bit")) return new BooleanGenerator();

        if (baseType.contains("timestamp") || baseType.contains("datetime")) return new LocalDateTimeGenerator();
        if (baseType.contains("date") && !baseType.contains("time")) return new LocalDateGenerator();
        if (baseType.contains("time")) return new LocalTimeGenerator();

        if (baseType.contains("blob")
                || baseType.contains("binary")
                || baseType.contains("varbinary")
                || baseType.contains("bytea")) {
            // 目前 DML 渲染对 byte[] 会生成 NULL，因此 blob/binary 走空值更安全
            return new NullGenerator();
        }

        return new StringGenerator(null);
    }

    private static String extractBaseType(String normalized) {
        // 例如："varchar(32)" -> "varchar"；"decimal(10,2)" -> "decimal"
        int idx = normalized.indexOf('(');
        String head = idx > 0 ? normalized.substring(0, idx) : normalized;
        // 例如："timestamp without time zone" -> 取第一个 token
        return head.split("\\s+")[0].trim();
    }

    private static int extractLengthOrMinusOne(String normalized) {
        int idx = normalized.indexOf('(');
        if (idx < 0) return -1;
        int end = normalized.indexOf(')', idx);
        if (end < 0) return -1;
        String inside = normalized.substring(idx + 1, end).trim();
        String first = inside.split(",")[0].trim();
        try {
            return Integer.parseInt(first);
        } catch (NumberFormatException ignored) {
            return -1;
        }
    }
}

