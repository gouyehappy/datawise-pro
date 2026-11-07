package org.apache.datawise.backend.ai.analysis.policy;

import com.alibaba.cloud.ai.graph.OverAllState;
import org.apache.datawise.backend.ai.analysis.AiAnalysisSteps;
import org.apache.datawise.backend.ai.analysis.graph.state.AiAnalysisGraphKeys;
import org.apache.datawise.backend.ai.config.AiAnalysisProperties;
import org.apache.datawise.backend.ai.domain.AiChatRequest;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class AiAnalysisStepPolicyTest {

    @Test
    void disablesOptionalStepFromYaml() {
        AiAnalysisProperties properties = new AiAnalysisProperties();
        properties.getSteps().setReport(false);
        AiAnalysisStepPolicy policy = new AiAnalysisStepPolicy(properties);
        OverAllState state = new OverAllState(Map.of());

        assertFalse(policy.isEnabled(AiAnalysisSteps.REPORT, state));
        assertTrue(policy.isEnabled(AiAnalysisSteps.SQL_GENERATE, state));
    }

    @Test
    void requestCanDisableChart() {
        AiAnalysisStepPolicy policy = new AiAnalysisStepPolicy(new AiAnalysisProperties());
        AiChatRequest request = new AiChatRequest(
                "q",
                List.of(),
                null,
                null,
                null,
                List.of("chart"),
                "custom"
        );
        OverAllState state = new OverAllState(Map.of(AiAnalysisGraphKeys.REQUEST, request));

        assertFalse(policy.isEnabled(AiAnalysisSteps.CHART, state));
    }

    @Test
    void keepsSummaryWhenBothSummaryAndReportDisabled() {
        AiAnalysisProperties properties = new AiAnalysisProperties();
        properties.getSteps().setSummary(false);
        properties.getSteps().setReport(false);
        AiAnalysisStepPolicy policy = new AiAnalysisStepPolicy(properties);
        OverAllState state = new OverAllState(Map.of());

        assertTrue(policy.isEnabled(AiAnalysisSteps.SUMMARY, state));
        assertFalse(policy.isEnabled(AiAnalysisSteps.REPORT, state));
    }
}
