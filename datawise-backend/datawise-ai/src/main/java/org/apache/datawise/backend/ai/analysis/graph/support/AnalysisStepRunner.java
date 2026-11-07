package org.apache.datawise.backend.ai.analysis.graph.support;

import org.apache.datawise.backend.ai.analysis.graph.runtime.AiAnalysisStepContext;
import org.apache.datawise.backend.ai.domain.AiAnalysisStepEvent;

import java.util.Map;
import java.util.function.Supplier;

/**
 * 分析流水线步骤上报：统一 running / ok / failed 事件与耗时计算。
 * 图节点通过此类发射 SSE 步骤，避免各节点重复样板代码。
 */
public final class AnalysisStepRunner {

    private AnalysisStepRunner() {
    }

    public static long start() {
        return System.currentTimeMillis();
    }

    public static long elapsedMs(long startedAt) {
        return System.currentTimeMillis() - startedAt;
    }

    public static void running(String step, String message) {
        emit(AiAnalysisStepEvent.running(step, message));
    }

    public static void ok(String step, String message, long startedAt, Map<String, Object> detail) {
        emit(AiAnalysisStepEvent.ok(step, message, elapsedMs(startedAt), detail));
    }

    public static void ok(String step, String message, long startedAt) {
        ok(step, message, startedAt, Map.of());
    }

    public static void failed(String step, String message) {
        emit(AiAnalysisStepEvent.failed(step, messageOf(message)));
    }

    public static void failed(String step, Throwable error) {
        emit(AiAnalysisStepEvent.failed(step, messageOf(error)));
    }

    /**
     * 执行带步骤上报的任务；失败时发射 failed 事件并重新抛出，由上层图引擎或 Controller 处理。
     */
    public static <T> T run(String step, String runningMessage, Supplier<T> task) {
        long startedAt = start();
        running(step, runningMessage);
        try {
            return task.get();
        } catch (RuntimeException ex) {
            failed(step, ex);
            throw ex;
        }
    }

    public static String messageOf(Throwable error) {
        if (error == null) {
            return "未知错误";
        }
        String message = error.getMessage();
        return message != null && !message.isBlank() ? message.trim() : error.getClass().getSimpleName();
    }

    public static String messageOf(String message) {
        return message != null && !message.isBlank() ? message.trim() : "未知错误";
    }

    private static void emit(AiAnalysisStepEvent event) {
        AiAnalysisStepContext.emit(event);
    }
}
