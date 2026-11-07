package org.apache.datawise.backend.ai.domain;

/**
 * 分析流水线执行结果（完成或等待确认）
 */
public record AiAnalysisRunOutcome(
        String status,
        AiChatReply reply,
        AiAnalysisInterruptPayload interrupt
) {
    public static final String STATUS_COMPLETED = "completed";
    public static final String STATUS_AWAITING_CONFIRMATION = "awaiting_confirmation";

    public static AiAnalysisRunOutcome completed(AiChatReply reply) {
        return new AiAnalysisRunOutcome(STATUS_COMPLETED, reply, null);
    }

    public static AiAnalysisRunOutcome awaitingConfirmation(AiAnalysisInterruptPayload interrupt) {
        return new AiAnalysisRunOutcome(STATUS_AWAITING_CONFIRMATION, null, interrupt);
    }

    public boolean awaitingConfirmation() {
        return STATUS_AWAITING_CONFIRMATION.equals(status);
    }
}
