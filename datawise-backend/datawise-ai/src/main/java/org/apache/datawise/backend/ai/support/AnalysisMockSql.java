package org.apache.datawise.backend.ai.support;

import org.apache.datawise.backend.ai.schema.AiSqlSchemaContext;
import org.apache.datawise.sqlparser.SqlTransformOps;

import java.util.List;
import java.util.Locale;

/**
 * 演示模式下的 mock SQL，供 chat 与 analysis 流水线共用
 */
public final class AnalysisMockSql {

    private AnalysisMockSql() {
    }

    public static String forPrompt(String prompt, AiSqlSchemaContext schema) {
        List<String> tables = schema != null && schema.tables() != null ? schema.tables() : List.of();
        if (!tables.isEmpty()) {
            String table = AiTableMatcher.pickTable(prompt, tables);
            if (table != null) {
                String lower = prompt.toLowerCase(Locale.ROOT);
                if (lower.contains("销售") || lower.contains("sale") || lower.contains("revenue")) {
                    return "-- AI: " + prompt + "\n"
                            + "SELECT DATE_FORMAT(created_at, '%Y-%m') AS month, SUM(amount) AS total_sales\n"
                            + "FROM " + table + "\n"
                            + "WHERE YEAR(created_at) = YEAR(CURDATE())\n"
                            + "GROUP BY DATE_FORMAT(created_at, '%Y-%m')\n"
                            + "ORDER BY month;";
                }
                if (lower.contains("user") || lower.contains("用户") || lower.contains("标签")) {
                    return "-- AI: " + prompt + "\n"
                            + SqlTransformOps.limitIfAbsent(
                                    "SELECT id, username, email, status\nFROM " + table, 100)
                            + ";";
                }
                try {
                    return "-- AI: " + prompt + "\n"
                            + SqlTransformOps.limitIfAbsent(
                                    SqlTransformOps.selectAllFrom(table), 100)
                            + ";";
                } catch (Exception ignored) {
                    return "-- AI: " + prompt + "\n"
                            + SqlTransformOps.limitIfAbsent(
                                    "SELECT * FROM " + table, 100)
                            + ";";
                }
            }
        }
        return "-- AI: " + prompt + "\n"
                + "SELECT '2026-01' AS month, 120 AS total_sales\n"
                + "UNION ALL SELECT '2026-02', 156\n"
                + "UNION ALL SELECT '2026-03', 189;";
    }
}
