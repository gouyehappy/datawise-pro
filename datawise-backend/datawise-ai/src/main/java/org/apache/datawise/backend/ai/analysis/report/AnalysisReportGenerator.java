package org.apache.datawise.backend.ai.analysis.report;

import org.apache.datawise.backend.ai.domain.AiAnalysisReportDto;
import org.apache.datawise.backend.ai.domain.AiChartSpecDto;
import org.apache.datawise.backend.domain.ExecuteSqlResult;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;

/**
 * 将摘要、SQL、图表、Python 洞察组装为 Markdown/HTML 报告
 */
@Component
public class AnalysisReportGenerator {

    /** Keep persisted chat reports renderable in the Agent UI. */
    private static final int MAX_PROMPT_CHARS = 4_000;
    private static final int MAX_SUMMARY_CHARS = 8_000;
    private static final int MAX_SQL_CHARS = 40_000;
    private static final int MAX_PYTHON_INSIGHT_CHARS = 40_000;

    public AiAnalysisReportDto generate(
            String prompt,
            String summary,
            String sql,
            ExecuteSqlResult result,
            AiChartSpecDto chart,
            String pythonInsight
    ) {
        StringBuilder markdown = new StringBuilder();
        markdown.append("# DataWise Analysis Report\n\n");
        String safePrompt = truncate(prompt, MAX_PROMPT_CHARS);
        String safeSummary = truncate(summary, MAX_SUMMARY_CHARS);
        String safeSql = truncate(sql, MAX_SQL_CHARS);
        String safePython = truncate(pythonInsight, MAX_PYTHON_INSIGHT_CHARS);
        if (safePrompt != null && !safePrompt.isBlank()) {
            markdown.append("## Question\n\n").append(safePrompt.trim()).append("\n\n");
        }
        if (safeSummary != null && !safeSummary.isBlank()) {
            markdown.append("## Summary\n\n").append(safeSummary.trim()).append("\n\n");
        }
        if (safePython != null && !safePython.isBlank()) {
            markdown.append("## Python Insights\n\n```text\n").append(safePython.trim()).append("\n```\n\n");
        }
        if (safeSql != null && !safeSql.isBlank()) {
            markdown.append("## SQL\n\n```sql\n").append(safeSql.trim()).append("\n```\n\n");
        }
        if (result != null) {
            markdown.append("## Data Preview\n\n");
            markdown.append("- Rows: ").append(result.rowCount()).append('\n');
            markdown.append("- Duration: ").append(result.durationMs()).append(" ms\n\n");
            markdown.append(renderMarkdownTable(result.columns(), result.rows(), 10));
            markdown.append('\n');
        }
        if (chart != null) {
            markdown.append("## Chart\n\n");
            markdown.append("- Type: ").append(chart.type()).append('\n');
            markdown.append("- Title: ").append(chart.title()).append('\n');
            markdown.append("- X: ").append(chart.xField()).append('\n');
            markdown.append("- Y: ").append(String.join(", ", chart.yFields())).append("\n\n");
        }

        String html = """
                <article class="dw-analysis-report">
                <h1>DataWise Analysis Report</h1>
                %s
                %s
                %s
                %s
                </article>
                """.formatted(
                section("Question", escapeHtml(safePrompt)),
                section("Summary", escapeHtml(safeSummary)),
                section("Python Insights", "<pre>" + escapeHtml(safePython) + "</pre>"),
                section("SQL", "<pre><code>" + escapeHtml(safeSql) + "</code></pre>")
        );
        return new AiAnalysisReportDto(markdown.toString().trim(), html.trim());
    }

    private static String truncate(String raw, int maxChars) {
        if (raw == null) {
            return null;
        }
        String trimmed = raw.trim();
        if (trimmed.length() <= maxChars) {
            return trimmed;
        }
        return trimmed.substring(0, maxChars) + "\n…";
    }

    private static String section(String title, String body) {
        if (body == null || body.isBlank()) {
            return "";
        }
        return "<section><h2>" + escapeHtml(title) + "</h2>" + body + "</section>";
    }

    private static String renderMarkdownTable(
            List<Map<String, Object>> columns,
            List<Map<String, Object>> rows,
            int limit
    ) {
        if (columns == null || columns.isEmpty() || rows == null || rows.isEmpty()) {
            return "_(empty)_\n";
        }
        List<String> keys = columns.stream()
                .map(col -> {
                    Object key = col.get("key") != null ? col.get("key") : col.get("name");
                    return key != null ? String.valueOf(key) : null;
                })
                .filter(k -> k != null && !k.isBlank())
                .toList();
        if (keys.isEmpty()) {
            return "_(empty)_\n";
        }
        StringBuilder table = new StringBuilder();
        table.append("| ").append(String.join(" | ", keys)).append(" |\n");
        table.append("|").append(" --- |".repeat(keys.size())).append("\n");
        int count = Math.min(limit, rows.size());
        for (int i = 0; i < count; i++) {
            Map<String, Object> row = rows.get(i);
            table.append("| ");
            for (int j = 0; j < keys.size(); j++) {
                if (j > 0) {
                    table.append(" | ");
                }
                Object value = row.get(keys.get(j));
                table.append(value != null ? String.valueOf(value).replace("|", "\\|") : "");
            }
            table.append(" |\n");
        }
        return table.toString();
    }

    private static String escapeHtml(String raw) {
        if (raw == null) {
            return "";
        }
        return raw.replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;");
    }
}
