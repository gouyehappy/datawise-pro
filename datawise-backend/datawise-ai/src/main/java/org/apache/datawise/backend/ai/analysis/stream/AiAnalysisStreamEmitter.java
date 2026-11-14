package org.apache.datawise.backend.ai.analysis.stream;

import org.apache.datawise.backend.ai.analysis.AiAnalysisErrorMapper;
import org.apache.datawise.backend.ai.domain.AiAnalysisInterruptPayload;
import org.apache.datawise.backend.ai.domain.AiAnalysisStepEvent;
import org.apache.datawise.backend.ai.domain.AiChatReply;
import org.apache.datawise.backend.common.support.ExceptionLogging;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;

/**
 * AI 分析 SSE 事件发送（step / result / interrupt / error）
 */
public final class AiAnalysisStreamEmitter {

    private static final Logger log = LoggerFactory.getLogger(AiAnalysisStreamEmitter.class);
    private static final long SSE_TIMEOUT_MS = 300_000L;

    private AiAnalysisStreamEmitter() {
    }

    public static SseEmitter createEmitter() {
        return new SseEmitter(SSE_TIMEOUT_MS);
    }

    public static void sendStep(SseEmitter emitter, AiAnalysisStepEvent step) {
        send(emitter, "step", step);
    }

    public static void sendResult(SseEmitter emitter, AiChatReply reply) {
        send(emitter, "result", reply);
    }

    public static void sendInterrupt(SseEmitter emitter, AiAnalysisInterruptPayload interrupt) {
        send(emitter, "interrupt", interrupt);
    }

    public static void sendError(SseEmitter emitter, Throwable error) {
        try {
            emitter.send(SseEmitter.event()
                    .name("error")
                    .data(AiAnalysisErrorMapper.map(error).toMap()));
        } catch (IOException ex) {
            ExceptionLogging.recoverable(log, "SSE error event send failed (client disconnected?)", ex);
        } catch (IllegalStateException ex) {
            // Emitter already completed/timed out; nothing left to report to.
            ExceptionLogging.recoverable(log, "SSE error event skipped (stream closed)", ex);
        }
    }

    public static void completeSuccess(SseEmitter emitter) {
        emitter.complete();
    }

    public static void completeFailure(SseEmitter emitter, Throwable error, Logger log) {
        sendError(emitter, error);
        log.warn("AI analysis stream failed: {}", AiAnalysisErrorMapper.userMessage(error));
        emitter.completeWithError(error);
    }

    private static void send(SseEmitter emitter, String eventName, Object data) {
        // Step boundaries are where a cancelled stream gets to stop. The cancel hook interrupts
        // the worker thread; without this check the graph would finish every remaining LLM call
        // and SQL statement for a client that is no longer listening.
        if (Thread.currentThread().isInterrupted()) {
            throw new AiStreamCancelledException("AI analysis stream cancelled before " + eventName);
        }
        try {
            emitter.send(SseEmitter.event().name(eventName).data(data));
        } catch (IOException ex) {
            throw new IllegalStateException("Failed to send SSE event: " + eventName, ex);
        }
    }
}
