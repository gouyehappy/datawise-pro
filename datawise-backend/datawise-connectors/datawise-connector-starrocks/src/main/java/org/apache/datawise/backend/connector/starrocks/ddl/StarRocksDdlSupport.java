package org.apache.datawise.backend.connector.starrocks.ddl;

import org.apache.datawise.backend.ddl.render.DialectSqlSupport;

import java.util.Locale;

/** StarRocks DDL 方言细节（DEFAULT 等与 MySQL 族差异）。 */
final class StarRocksDdlSupport {

    private StarRocksDdlSupport() {
    }

    /**
     * StarRocks 不接受 MySQL 风格的 {@code DEFAULT 0}，数值/字符串默认值须为字面量（如 {@code DEFAULT '0'}）。
     */
    static String formatDefaultClause(String defaultExpression) {
        if (defaultExpression == null || defaultExpression.isBlank()) {
            return null;
        }
        String trimmed = defaultExpression.trim();
        if (trimmed.equalsIgnoreCase("NULL")) {
            return null;
        }
        if (isQuoted(trimmed) || isKeywordDefault(trimmed)) {
            return trimmed;
        }
        if (trimmed.matches("-?\\d+(\\.\\d+)?")) {
            return "'" + trimmed + "'";
        }
        return "'" + DialectSqlSupport.escapeSingleQuote(trimmed) + "'";
    }

    private static boolean isKeywordDefault(String value) {
        String upper = value.toUpperCase(Locale.ROOT);
        return upper.startsWith("CURRENT_TIMESTAMP")
                || upper.equals("CURRENT_DATE")
                || upper.equals("CURRENT_TIME");
    }

    private static boolean isQuoted(String value) {
        return (value.length() >= 2 && value.startsWith("'") && value.endsWith("'"))
                || (value.length() >= 2 && value.startsWith("\"") && value.endsWith("\""));
    }
}
