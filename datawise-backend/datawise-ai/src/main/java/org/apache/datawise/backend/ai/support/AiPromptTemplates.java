package org.apache.datawise.backend.ai.support;

import org.apache.datawise.backend.ai.domain.AiAnalysisContextDto;
import org.apache.datawise.backend.ai.domain.AiChartSpecDto;
import org.apache.datawise.backend.ai.domain.AiEvidenceBundle;
import org.apache.datawise.backend.domain.ExecuteSqlResult;
import org.apache.datawise.backend.ai.schema.AiSqlSchemaContext;
import org.apache.datawise.backend.ai.support.prompt.AiAnalysisPromptTemplates;
import org.apache.datawise.backend.ai.support.prompt.AiChatPromptTemplates;
import org.apache.datawise.backend.ai.support.prompt.AiSqlPromptTemplates;

import java.util.List;
import java.util.Map;

/** AI LLM 提示词模板门面；实现见 {@code ai.support.prompt}。 */
public final class AiPromptTemplates {

    private AiPromptTemplates() {
    }

    public static String renderChatSystemPrompt(String scopeHint) {
        return AiChatPromptTemplates.renderSystemPrompt(scopeHint);
    }

    public static String renderSqlSystemPrompt(AiSqlSchemaContext context) {
        return AiSqlPromptTemplates.renderSystemPrompt(context);
    }

    public static String renderSqlSystemPrompt(AiSqlSchemaContext context, AiEvidenceBundle evidence) {
        return AiSqlPromptTemplates.renderSystemPrompt(context, evidence);
    }

    public static String renderAnalysisSqlUserPrompt(String prompt, AiAnalysisContextDto context) {
        return AiSqlPromptTemplates.renderAnalysisSqlUserPrompt(prompt, context);
    }

    public static String renderSqlValidationRetryUserPrompt(
            String prompt,
            AiAnalysisContextDto context,
            String failedSql,
            String validationError
    ) {
        return AiSqlPromptTemplates.renderValidationRetryUserPrompt(prompt, context, failedSql, validationError);
    }

    public static String renderSqlExecutionRetryUserPrompt(
            String prompt,
            AiAnalysisContextDto context,
            String failedSql,
            String executionError,
            Integer errorLine
    ) {
        return AiSqlPromptTemplates.renderExecutionRetryUserPrompt(
                prompt, context, failedSql, executionError, errorLine
        );
    }

    public static String renderAnalysisSummaryPrompt() {
        return AiAnalysisPromptTemplates.renderSummarySystemPrompt();
    }

    public static String renderAnalysisSummaryUserPrompt(
            String question,
            String sql,
            int rowCount,
            List<Map<String, Object>> columns,
            List<Map<String, Object>> rows,
            AiChartSpecDto chart
    ) {
        return AiAnalysisPromptTemplates.renderSummaryUserPrompt(
                question, sql, rowCount, columns, rows, chart
        );
    }

    public static String renderPythonAnalysisSystemPrompt() {
        return AiAnalysisPromptTemplates.renderPythonAnalysisSystemPrompt();
    }

    public static String renderPythonAnalysisUserPrompt(
            String prompt,
            ExecuteSqlResult sqlResult,
            String failedCode,
            String errorMessage
    ) {
        return AiAnalysisPromptTemplates.renderPythonAnalysisUserPrompt(
                prompt, sqlResult, failedCode, errorMessage
        );
    }

    public static String renderPythonAnalyzeSystemPrompt() {
        return AiAnalysisPromptTemplates.renderPythonAnalyzeSystemPrompt();
    }

    public static String renderPythonAnalyzeUserPrompt(String prompt, String pythonStdout) {
        return AiAnalysisPromptTemplates.renderPythonAnalyzeUserPrompt(prompt, pythonStdout);
    }

    public static String renderAnalysisStepRouteSystemPrompt() {
        return AiAnalysisPromptTemplates.renderStepRouteSystemPrompt();
    }

    public static String renderAnalysisStepRouteUserPrompt(String prompt, int targetCount) {
        return AiAnalysisPromptTemplates.renderStepRouteUserPrompt(prompt, targetCount);
    }
}
