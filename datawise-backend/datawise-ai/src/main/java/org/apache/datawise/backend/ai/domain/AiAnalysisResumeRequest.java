package org.apache.datawise.backend.ai.domain;

import jakarta.validation.constraints.NotBlank;

/**
 * 恢复被 interrupt 的分析流水线
 */
public record AiAnalysisResumeRequest(
        @NotBlank(message = "threadId is required") String threadId,
        String checkpointId,
        boolean approved
) {
}
