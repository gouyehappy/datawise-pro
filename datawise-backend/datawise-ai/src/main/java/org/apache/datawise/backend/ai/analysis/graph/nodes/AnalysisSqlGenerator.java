package org.apache.datawise.backend.ai.analysis.graph.nodes;

import org.apache.datawise.backend.ai.support.AiLlmGateway;
import org.apache.datawise.backend.ai.support.AiPromptTemplates;
import org.apache.datawise.backend.ai.schema.AiSqlSchemaContext;
import org.apache.datawise.backend.ai.support.AnalysisMockSql;
import org.apache.datawise.backend.ai.domain.AiAnalysisContextDto;
import org.apache.datawise.backend.ai.domain.AiLlmProfileDto;
import org.apache.datawise.backend.ai.domain.AiEvidenceBundle;
import org.springframework.stereotype.Component;

/**
 * LLM / mock 生成分析用 SQL
 */
@Component
public class AnalysisSqlGenerator {

    private final AiLlmGateway aiLlmGateway;

    public AnalysisSqlGenerator(AiLlmGateway aiLlmGateway) {
        this.aiLlmGateway = aiLlmGateway;
    }

    public String generate(
            AiLlmProfileDto llm,
            String prompt,
            AiSqlSchemaContext schema,
            AiEvidenceBundle evidence,
            AiAnalysisContextDto context
    ) {
        if (aiLlmGateway.isMock(llm)) {
            return AnalysisMockSql.forPrompt(prompt, schema);
        }
        String systemPrompt = AiPromptTemplates.renderSqlSystemPrompt(schema, evidence);
        String userPrompt = AiPromptTemplates.renderAnalysisSqlUserPrompt(prompt, context);
        return aiLlmGateway.complete(llm, systemPrompt, userPrompt, "analysis-sql");
    }

    public String regenerateAfterValidationError(
            AiLlmProfileDto llm,
            String prompt,
            AiSqlSchemaContext schema,
            AiEvidenceBundle evidence,
            AiAnalysisContextDto context,
            String failedSql,
            String validationError
    ) {
        if (aiLlmGateway.isMock(llm)) {
            return AnalysisMockSql.forPrompt(prompt, schema);
        }
        String systemPrompt = AiPromptTemplates.renderSqlSystemPrompt(schema, evidence);
        String userPrompt = AiPromptTemplates.renderSqlValidationRetryUserPrompt(
                prompt,
                context,
                failedSql,
                validationError
        );
        return aiLlmGateway.complete(llm, systemPrompt, userPrompt, "analysis-sql-validate-retry");
    }

    public String regenerateAfterExecutionError(
            AiLlmProfileDto llm,
            String prompt,
            AiSqlSchemaContext schema,
            AiEvidenceBundle evidence,
            AiAnalysisContextDto context,
            String failedSql,
            String executionError,
            Integer errorLine
    ) {
        if (aiLlmGateway.isMock(llm)) {
            return AnalysisMockSql.forPrompt(prompt, schema);
        }
        String systemPrompt = AiPromptTemplates.renderSqlSystemPrompt(schema, evidence);
        String userPrompt = AiPromptTemplates.renderSqlExecutionRetryUserPrompt(
                prompt,
                context,
                failedSql,
                executionError,
                errorLine
        );
        return aiLlmGateway.complete(llm, systemPrompt, userPrompt, "analysis-sql-retry");
    }
}
