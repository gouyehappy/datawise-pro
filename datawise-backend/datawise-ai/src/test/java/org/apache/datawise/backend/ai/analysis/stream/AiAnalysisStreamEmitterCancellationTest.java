package org.apache.datawise.backend.ai.analysis.stream;

import org.apache.datawise.backend.ai.domain.AiAnalysisStepEvent;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertThrows;

/**
 * The cancel hooks interrupt the worker; these assertions cover what the worker does with it.
 */
class AiAnalysisStreamEmitterCancellationTest {

    private static final AiAnalysisStepEvent STEP = AiAnalysisStepEvent.running("sql_generate", "generating");

    @AfterEach
    void clearInterrupt() {
        Thread.interrupted();
    }

    @Test
    void sendStepStopsTheGraphWhenTheWorkerWasInterrupted() {
        Thread.currentThread().interrupt();

        AiStreamCancelledException thrown = assertThrows(
                AiStreamCancelledException.class,
                () -> AiAnalysisStreamEmitter.sendStep(new SseEmitter(1_000L), STEP));

        org.junit.jupiter.api.Assertions.assertTrue(thrown.getMessage().contains("step"));
    }

    @Test
    void sendResultAlsoHonoursCancellation() {
        Thread.currentThread().interrupt();

        assertThrows(
                AiStreamCancelledException.class,
                () -> AiAnalysisStreamEmitter.sendResult(new SseEmitter(1_000L), null));
    }

    @Test
    void uninterruptedStreamStillSends() {
        SseEmitter emitter = new SseEmitter(1_000L);

        assertDoesNotThrow(() -> AiAnalysisStreamEmitter.sendStep(emitter, STEP));
    }

    @Test
    void errorEventOnAClosedEmitterIsSwallowed() {
        SseEmitter emitter = new SseEmitter(1_000L);
        emitter.complete();

        assertDoesNotThrow(() -> AiAnalysisStreamEmitter.sendError(emitter, new IllegalStateException("boom")));
    }
}
