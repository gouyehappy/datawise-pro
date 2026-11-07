package org.apache.datawise.backend.ai.domain;

/**
 * SQL 执行前人工确认（StateGraph interrupt）
 */
public record AiAnalysisInterruptPayload(
        String threadId,
        String checkpointId,
        String sql,
        String nextStep
) {
}
