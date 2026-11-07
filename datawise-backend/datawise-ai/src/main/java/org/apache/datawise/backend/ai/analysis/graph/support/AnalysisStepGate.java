package org.apache.datawise.backend.ai.analysis.graph.support;

import com.alibaba.cloud.ai.graph.OverAllState;
import org.apache.datawise.backend.ai.analysis.policy.AiAnalysisStepPolicy;
import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.Optional;

/**
 * 按策略静默跳过可选分析步骤（不单独上报 skipped 事件）
 */
@Component
public class AnalysisStepGate {

    private final AiAnalysisStepPolicy stepPolicy;

    public AnalysisStepGate(AiAnalysisStepPolicy stepPolicy) {
        this.stepPolicy = stepPolicy;
    }

    public Optional<Map<String, Object>> skipUnlessEnabled(
            String step,
            OverAllState state,
            Map<String, Object> stateUpdates
    ) {
        if (stepPolicy.isEnabled(step, state)) {
            return Optional.empty();
        }
        return Optional.of(stateUpdates != null ? stateUpdates : Map.of());
    }
}
