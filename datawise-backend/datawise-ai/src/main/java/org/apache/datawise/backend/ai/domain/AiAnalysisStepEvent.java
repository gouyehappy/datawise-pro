package org.apache.datawise.backend.ai.domain;

import java.util.Map;

/**
 * 数据分析流水线单步事件（SSE / 日志）
 */
public record AiAnalysisStepEvent(
        String step,
        String status,
        String message,
        Long durationMs,
        Map<String, Object> detail
) {
    public static final String STATUS_RUNNING = "running";
    public static final String STATUS_OK = "ok";
    public static final String STATUS_FAILED = "failed";
    public static final String STATUS_SKIPPED = "skipped";

    public static AiAnalysisStepEvent running(String step, String message) {
        return new AiAnalysisStepEvent(step, STATUS_RUNNING, message, null, null);
    }

    public static AiAnalysisStepEvent ok(String step, String message, long durationMs, Map<String, Object> detail) {
        return new AiAnalysisStepEvent(step, STATUS_OK, message, durationMs, detail);
    }

    public static AiAnalysisStepEvent failed(String step, String message) {
        return new AiAnalysisStepEvent(step, STATUS_FAILED, message, null, null);
    }

    public static AiAnalysisStepEvent skipped(String step, String message, long durationMs) {
        return new AiAnalysisStepEvent(step, STATUS_SKIPPED, message, durationMs, Map.of("skipped", true));
    }
}
