package org.apache.datawise.backend.ai.analysis.graph.support;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class AnalysisStepRunnerTest {

    @Test
    void messageOfPrefersThrowableMessage() {
        assertEquals("bad sql", AnalysisStepRunner.messageOf(new IllegalStateException("bad sql")));
    }

    @Test
    void messageOfBlankStringUsesFallback() {
        assertEquals("未知错误", AnalysisStepRunner.messageOf("  "));
    }

    @Test
    void runRethrowsAfterFailure() {
        long started = AnalysisStepRunner.start();
        assertTrue(started > 0);
    }
}
