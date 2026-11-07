package org.apache.datawise.backend.ai.analysis.graph.runtime;

import org.apache.datawise.backend.ai.domain.AiAnalysisStepEvent;

import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Consumer;
import java.util.function.Supplier;

/**
 * 图节点内发射 SSE 步骤事件。HTTP 线程与 ForkJoin 工作线程通过 runId 共享 handler。
 */
public final class AiAnalysisStepContext {

    private static final ThreadLocal<Consumer<AiAnalysisStepEvent>> ON_STEP = new ThreadLocal<>();
    private static final ThreadLocal<String> CURRENT_RUN_ID = new ThreadLocal<>();
    private static final Map<String, Consumer<AiAnalysisStepEvent>> RUN_HANDLERS = new ConcurrentHashMap<>();

    private AiAnalysisStepContext() {
    }

    public static <T> T runWith(Consumer<AiAnalysisStepEvent> onStep, Supplier<T> task) {
        String runId = beginRun(onStep);
        try {
            return task.get();
        } finally {
            endRun(runId);
        }
    }

    public static String currentRunId() {
        return CURRENT_RUN_ID.get();
    }

    public static <T> T runForRun(String runId, Supplier<T> task) {
        Consumer<AiAnalysisStepEvent> handler = resolveHandler(runId);
        if (handler == null) {
            return task.get();
        }
        ON_STEP.set(handler);
        try {
            return task.get();
        } finally {
            ON_STEP.remove();
        }
    }

    public static void emit(AiAnalysisStepEvent event) {
        Consumer<AiAnalysisStepEvent> handler = ON_STEP.get();
        if (handler != null) {
            handler.accept(event);
        }
    }

    private static String beginRun(Consumer<AiAnalysisStepEvent> onStep) {
        String runId = UUID.randomUUID().toString();
        CURRENT_RUN_ID.set(runId);
        if (onStep != null) {
            RUN_HANDLERS.put(runId, onStep);
            ON_STEP.set(onStep);
        }
        return runId;
    }

    private static void endRun(String runId) {
        CURRENT_RUN_ID.remove();
        ON_STEP.remove();
        if (runId != null) {
            RUN_HANDLERS.remove(runId);
        }
    }

    private static Consumer<AiAnalysisStepEvent> resolveHandler(String runId) {
        if (runId != null) {
            Consumer<AiAnalysisStepEvent> registered = RUN_HANDLERS.get(runId);
            if (registered != null) {
                return registered;
            }
        }
        return ON_STEP.get();
    }
}
