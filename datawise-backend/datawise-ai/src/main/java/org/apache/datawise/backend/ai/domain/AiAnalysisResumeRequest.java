package org.apache.datawise.backend.ai.domain;

import jakarta.validation.constraints.NotBlank;

/**
 * 恢复被 interrupt 的分析流水线；批准写操作时需携带 exact-SQL grant（T-AI-1）。
 */
public record AiAnalysisResumeRequest(
        @NotBlank(message = "threadId is required") String threadId,
        String checkpointId,
        boolean approved,
        String grantId,
        String confirmedSql
) {
    public AiAnalysisResumeRequest(String threadId, String checkpointId, boolean approved) {
        this(threadId, checkpointId, approved, null, null);
    }
}
