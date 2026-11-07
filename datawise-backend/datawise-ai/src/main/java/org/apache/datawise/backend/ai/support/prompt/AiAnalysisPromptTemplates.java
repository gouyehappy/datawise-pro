package org.apache.datawise.backend.ai.support.prompt;

import org.apache.datawise.backend.ai.domain.AiChartSpecDto;
import org.apache.datawise.backend.domain.ExecuteSqlResult;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

public final class AiAnalysisPromptTemplates {

    private AiAnalysisPromptTemplates() {
    }

    public static String renderSummarySystemPrompt() {
        return String.join("\n", List.of(
                "You are a data analyst for DataWise.",
                "Summarize SQL query results clearly in the same language as the user.",
                "Highlight key trends, outliers, and actionable insights.",
                "Keep the reply concise (3-6 sentences). Do not repeat the full SQL."
        ));
    }

    public static String renderSummaryUserPrompt(
            String question,
            String sql,
            int rowCount,
            List<Map<String, Object>> columns,
            List<Map<String, Object>> rows,
            AiChartSpecDto chart
    ) {
        List<String> lines = new ArrayList<>();
        lines.add("User question: " + question);
        lines.add("Executed SQL:\n" + sql);
        lines.add("Row count: " + rowCount);
        lines.add("Columns: " + AiPromptFormatters.formatColumns(columns));
        lines.add("Sample rows (up to 20):\n" + AiPromptFormatters.formatRows(columns, rows, 20));
        if (chart != null) {
            lines.add("Chart type: " + chart.type());
            lines.add("Chart x field: " + chart.xField());
            lines.add("Chart y fields: " + String.join(", ", chart.yFields()));
        }
        return String.join("\n\n", lines);
    }

    public static String renderPythonAnalysisSystemPrompt() {
        return String.join("\n", List.of(
                "You are a Python data analyst for DataWise.",
                "Generate executable Python 3 code using pandas/numpy when helpful.",
                "Assume SQL results are already loaded in variable `df` as a pandas DataFrame.",
                "Print concise findings to stdout. Do not access network or filesystem.",
                "Return only Python code without markdown fences."
        ));
    }

    public static String renderPythonAnalysisUserPrompt(
            String prompt,
            ExecuteSqlResult sqlResult,
            String failedCode,
            String errorMessage
    ) {
        List<String> lines = new ArrayList<>();
        lines.add("User question:");
        lines.add(prompt != null ? prompt : "");
        lines.add("");
        lines.add("SQL result preview (already loaded as pandas DataFrame `df`):");
        lines.add("rowCount=" + (sqlResult != null ? sqlResult.rowCount() : 0));
        if (sqlResult != null) {
            lines.add("columns=" + AiPromptFormatters.formatColumns(sqlResult.columns()));
            lines.add("sampleRows=");
            lines.add(AiPromptFormatters.formatRows(sqlResult.columns(), sqlResult.rows(), 5));
        }
        if (failedCode != null && !failedCode.isBlank()) {
            lines.add("");
            lines.add("Previous Python code failed:");
            lines.add(failedCode);
            lines.add("Error:");
            lines.add(errorMessage != null ? errorMessage : "unknown");
            lines.add("Fix the code and print actionable analysis to stdout.");
        }
        return String.join("\n", lines);
    }

    public static String renderPythonAnalyzeSystemPrompt() {
        return String.join("\n", List.of(
                "You summarize Python statistical analysis output for business users.",
                "Use the same language as the user question when possible.",
                "Keep the answer concise (2-5 sentences)."
        ));
    }

    public static String renderPythonAnalyzeUserPrompt(String prompt, String pythonStdout) {
        return String.join("\n\n", List.of(
                "User question: " + (prompt != null ? prompt : ""),
                "Python stdout:\n" + (pythonStdout != null ? pythonStdout : "")
        ));
    }

    public static String renderStepRouteSystemPrompt() {
        return """
                You are a data analysis pipeline router. Given a user question, decide which OPTIONAL steps to SKIP.
                Required steps (intent, schema, sql_generate, sql_execute) always run do not list them.
                Optional step ids: planner, evidence, sql_validate, python, chart, summary, report.
                Rules:
                - Keep at least one of summary or report enabled (do not disable both).
                - Disable python unless statistical/ML/forecast work is needed.
                - Disable chart unless visualization/trend/distribution is useful.
                - Disable evidence for simple single-table lookups; enable for domain jargon or RAG needs.
                - Disable report for quick answers; enable for comprehensive write-ups.
                - Disable planner for trivial SQL; enable for multi-step or Python/federated analysis.
                Reply with JSON only: {"disabledSteps":["..."],"rationale":"one sentence in Chinese"}
                """;
    }

    public static String renderStepRouteUserPrompt(String prompt, int targetCount) {
        List<String> lines = new ArrayList<>();
        lines.add("User question:");
        lines.add(prompt != null ? prompt : "");
        lines.add("Selected data sources: " + targetCount);
        lines.add("Choose disabled optional steps for this single analysis run.");
        return String.join("\n", lines);
    }
}
