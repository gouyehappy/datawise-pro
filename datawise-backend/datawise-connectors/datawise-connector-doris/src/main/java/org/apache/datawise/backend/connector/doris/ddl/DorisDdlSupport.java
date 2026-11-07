package org.apache.datawise.backend.connector.doris.ddl;

import org.apache.datawise.backend.ddl.render.DialectSqlSupport;

import java.util.Locale;

/** Doris DDL 方言细节（与 MySQL 族差异）。 */
final class DorisDdlSupport {

    private DorisDdlSupport() {
    }

    /**
     * Doris 数值默认值须写成字符串字面量（{@code DEFAULT "0"}），不能直接沿用 MySQL 的 {@code DEFAULT 0}。
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
            return "\"" + trimmed + "\"";
        }
        return "'" + DialectSqlSupport.escapeSingleQuote(trimmed) + "'";
    }

    private static boolean isKeywordDefault(String value) {
        String upper = value.toUpperCase(Locale.ROOT);
        return upper.startsWith("CURRENT_TIMESTAMP")
                || upper.equals("CURRENT_DATE")
                || upper.equals("CURRENT_TIME")
                || upper.startsWith("BITMAP_EMPTY");
    }

    private static boolean isQuoted(String value) {
        return (value.length() >= 2 && value.startsWith("'") && value.endsWith("'"))
                || (value.length() >= 2 && value.startsWith("\"") && value.endsWith("\""));
    }
}
