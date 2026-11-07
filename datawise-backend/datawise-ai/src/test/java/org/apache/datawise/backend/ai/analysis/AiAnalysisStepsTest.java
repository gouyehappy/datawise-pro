package org.apache.datawise.backend.ai.analysis;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class AiAnalysisStepsTest {

    @Test
    void expandsPythonAliasToChainSteps() {
        var expanded = AiAnalysisSteps.expandDisabled(List.of("python", "chart"));

        assertTrue(expanded.contains("python"));
        assertTrue(expanded.contains(AiAnalysisSteps.PYTHON_GENERATE));
        assertTrue(expanded.contains(AiAnalysisSteps.PYTHON_EXECUTE));
        assertTrue(expanded.contains(AiAnalysisSteps.PYTHON_ANALYZE));
        assertTrue(expanded.contains(AiAnalysisSteps.CHART));
    }

    @Test
    void quickDisabledMatchesConfigurableSubset() {
        for (String step : AiAnalysisSteps.QUICK_DISABLED) {
            assertTrue(
                    AiAnalysisSteps.CONFIGURABLE.contains(step),
                    () -> "quick disabled step not configurable: " + step
            );
        }
        assertEquals(5, AiAnalysisSteps.QUICK_DISABLED.size());
    }
}
