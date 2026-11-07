package org.apache.datawise.backend.ai.analysis.graph.runtime;

import org.apache.datawise.backend.ai.domain.AiAnalysisStepEvent;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.atomic.AtomicReference;

import static org.junit.jupiter.api.Assertions.assertEquals;

class AiAnalysisStepContextTest {

    @Test
    void runForRun_emitsOnWorkerThreadUsingRunId() throws Exception {
        List<AiAnalysisStepEvent> events = new ArrayList<>();
        AtomicReference<String> runId = new AtomicReference<>();
        CountDownLatch handlerRegistered = new CountDownLatch(1);
        CountDownLatch releaseRun = new CountDownLatch(1);

        Thread holder = new Thread(() -> AiAnalysisStepContext.runWith(events::add, () -> {
            runId.set(AiAnalysisStepContext.currentRunId());
            handlerRegistered.countDown();
            try {
                releaseRun.await();
            } catch (InterruptedException ex) {
                Thread.currentThread().interrupt();
            }
            return null;
        }));

        holder.start();
        handlerRegistered.await();

        Thread worker = new Thread(() ->
                AiAnalysisStepContext.runForRun(runId.get(), () -> {
                    AiAnalysisStepContext.emit(AiAnalysisStepEvent.running("intent", "working"));
                    return null;
                })
        );
        worker.start();
        worker.join();
        releaseRun.countDown();
        holder.join();

        assertEquals(1, events.size());
        assertEquals("intent", events.get(0).step());
        assertEquals("working", events.get(0).message());
    }
}
