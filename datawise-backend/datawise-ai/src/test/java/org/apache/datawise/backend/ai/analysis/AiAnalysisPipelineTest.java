package org.apache.datawise.backend.ai.analysis;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

class AiAnalysisPipelineTest {

    @Test
    void pipelineOrderMatchesFrontendContract() {
        assertEquals(14, AiAnalysisSteps.PIPELINE_ORDER.size());
        assertEquals(AiAnalysisSteps.INTENT, AiAnalysisSteps.PIPELINE_ORDER.get(0));
        assertEquals(AiAnalysisSteps.STEP_ROUTE, AiAnalysisSteps.PIPELINE_ORDER.get(1));
        assertEquals(AiAnalysisSteps.REPORT, AiAnalysisSteps.PIPELINE_ORDER.get(13));
        assertEquals(AiAnalysisSteps.CONFIGURABLE.size(), 7);
    }
}
