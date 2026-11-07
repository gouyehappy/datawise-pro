package org.apache.datawise.backend.ai.domain;

import jakarta.validation.constraints.NotBlank;

import java.util.List;
import java.util.Map;

public record AiChatRequest(
        @NotBlank(message = "prompt is required") String prompt,
        List<AiDatabaseTargetDto> targets,
        AiLlmProfileDto llm,
        AiAnalysisContextDto analysisContext,
        Boolean skipSqlConfirmation,
        List<String> disabledAnalysisSteps,
        String analysisMode,
        Map<String, AiLlmProfileDto> stepLlms
) {
    public AiChatRequest(
            String prompt,
            List<AiDatabaseTargetDto> targets,
            AiLlmProfileDto llm,
            AiAnalysisContextDto analysisContext,
            Boolean skipSqlConfirmation
    ) {
        this(prompt, targets, llm, analysisContext, skipSqlConfirmation, List.of(), "smart", Map.of());
    }

    public AiChatRequest(
            String prompt,
            List<AiDatabaseTargetDto> targets,
            AiLlmProfileDto llm,
            AiAnalysisContextDto analysisContext,
            Boolean skipSqlConfirmation,
            List<String> disabledAnalysisSteps
    ) {
        this(prompt, targets, llm, analysisContext, skipSqlConfirmation, disabledAnalysisSteps, "smart", Map.of());
    }

    public AiChatRequest(
            String prompt,
            List<AiDatabaseTargetDto> targets,
            AiLlmProfileDto llm,
            AiAnalysisContextDto analysisContext,
            Boolean skipSqlConfirmation,
            List<String> disabledAnalysisSteps,
            String analysisMode
    ) {
        this(prompt, targets, llm, analysisContext, skipSqlConfirmation, disabledAnalysisSteps, analysisMode, Map.of());
    }
}
