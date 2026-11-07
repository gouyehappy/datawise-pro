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
     */
    private static String dropLeadingNonSql(String sql) {
        String[] lines = sql.split("\n", -1);
        int selectIdx = -1;
        for (int i = 0; i < lines.length; i++) {
            String lineTrimmed = lines[i].trim();
            if (lineTrimmed.isEmpty()) {
                continue;
            }
            if (isSelectOrWith(lineTrimmed)) {
                selectIdx = i;
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
            kept.append(lines[i]).append('\n');
        }
        return kept.toString().trim();
    }

    private static boolean isSelectOrWith(String line) {
        String upper = line.toUpperCase(Locale.ROOT);
        return upper.startsWith("SELECT") || upper.startsWith("WITH");
    }

    static String firstStatement(String sql) {
        return SqlTextSupport.firstStatement(sql);
    }

    static List<String> splitStatements(String sql) {
        return SqlTextSupport.splitStatements(sql);
    }
}
