package org.apache.datawise.backend.ai.support;

import org.apache.datawise.sqlparser.support.SqlTextSupport;

import java.util.List;
import java.util.Locale;

/**
 * 将 LLM 输出规范为单条可执行 SQL（去围栏、去前言、取第一条语句）
 */
final class AiSqlNormalizer {

    private AiSqlNormalizer() {
    }

    static String normalize(String sql) {
        if (sql == null || sql.isBlank()) {
            return "";
        }
        String trimmed = AiLlmGateway.stripCodeFence(sql).trim();
        trimmed = dropLeadingNonSql(trimmed);
        if (trimmed.isBlank()) {
            return "";
        }
        return firstStatement(trimmed).trim();
    }

    /**
     * Keep optional leading {@code --} comment lines only when a real SELECT/WITH follows.
     * Comment-only replies become empty so validation fails instead of pretending SQL exists.
     * Finds the first SELECT/WITH keyword even when preceded by EXPLAIN, hints, or parentheses.
     */
    private static String dropLeadingNonSql(String sql) {
        String[] lines = sql.split("\n", -1);
        int selectIdx = -1;
        int keywordOffsetInLine = -1;
        for (int i = 0; i < lines.length; i++) {
            int offset = indexOfSelectOrWithKeyword(lines[i]);
            if (offset >= 0) {
                selectIdx = i;
                keywordOffsetInLine = offset;
                break;
            }
        }
        if (selectIdx < 0) {
            return "";
        }

        int from = selectIdx;
        while (from > 0) {
            String prev = lines[from - 1].trim();
            if (prev.isEmpty() || prev.startsWith("--")) {
                from--;
            } else {
                break;
            }
        }
        while (from < selectIdx && lines[from].trim().isEmpty()) {
            from++;
        }

        StringBuilder kept = new StringBuilder();
        for (int i = from; i < lines.length; i++) {
            if (i == selectIdx && keywordOffsetInLine > 0) {
                // Drop prose / EXPLAIN / leading junk before the first SELECT/WITH on that line.
                kept.append(lines[i].substring(keywordOffsetInLine));
            } else {
                kept.append(lines[i]);
            }
            kept.append('\n');
        }
        return kept.toString().trim();
    }

    /** Index of the first SELECT or WITH keyword in {@code line}, or -1. */
    static int indexOfSelectOrWithKeyword(String line) {
        if (line == null || line.isBlank()) {
            return -1;
        }
        String upper = line.toUpperCase(Locale.ROOT);
        int select = indexOfSqlKeyword(upper, "SELECT");
        int with = indexOfSqlKeyword(upper, "WITH");
        if (select < 0) {
            return with;
        }
        if (with < 0) {
            return select;
        }
        return Math.min(select, with);
    }

    private static int indexOfSqlKeyword(String upperHaystack, String keyword) {
        int from = 0;
        while (from <= upperHaystack.length() - keyword.length()) {
            int idx = upperHaystack.indexOf(keyword, from);
            if (idx < 0) {
                return -1;
            }
            boolean leftOk = idx == 0 || !isIdentChar(upperHaystack.charAt(idx - 1));
            int after = idx + keyword.length();
            boolean rightOk = after >= upperHaystack.length() || !isIdentChar(upperHaystack.charAt(after));
            if (leftOk && rightOk) {
                return idx;
            }
            from = idx + 1;
        }
        return -1;
    }

    private static boolean isIdentChar(char c) {
        return (c >= 'A' && c <= 'Z')
                || (c >= '0' && c <= '9')
                || c == '_'
                || c == '$';
    }

    static String firstStatement(String sql) {
        return SqlTextSupport.firstStatement(sql);
    }

    static List<String> splitStatements(String sql) {
        return SqlTextSupport.splitStatements(sql);
    }
}
