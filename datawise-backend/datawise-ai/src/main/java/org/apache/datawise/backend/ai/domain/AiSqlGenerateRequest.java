package org.apache.datawise.backend.ai.domain;

import jakarta.validation.constraints.NotBlank;

public record AiSqlGenerateRequest(
        @NotBlank(message = "prompt is required") String prompt,
        String connectionId,
        String database,
        AiLlmProfileDto llm
) {
}
