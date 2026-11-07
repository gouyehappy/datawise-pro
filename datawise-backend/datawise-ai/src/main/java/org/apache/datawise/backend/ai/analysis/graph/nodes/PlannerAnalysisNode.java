package org.apache.datawise.backend.ai.analysis.graph.nodes;

import com.alibaba.cloud.ai.graph.OverAllState;
import org.apache.datawise.backend.ai.analysis.AiAnalysisSteps;
import org.apache.datawise.backend.ai.analysis.graph.state.AiAnalysisGraphKeys;
import org.apache.datawise.backend.ai.analysis.graph.state.AiAnalysisGraphStateCoercion;
import org.apache.datawise.backend.ai.analysis.graph.support.AnalysisStepGate;
import org.apache.datawise.backend.ai.analysis.graph.support.AnalysisStepRunner;
import org.apache.datawise.backend.ai.analysis.plan.AiAnalysisPlannerService;
import org.apache.datawise.backend.ai.domain.AiChatRequest;
import org.apache.datawise.backend.ai.domain.AiAnalysisPlan;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;

/**
 * 步骤：生成分析执行计划（SQL / Python / 跨库）
 */
@Component
public class PlannerAnalysisNode {

    private final AiAnalysisPlannerService plannerService;
    private final AnalysisStepGate stepGate;

    public PlannerAnalysisNode(AiAnalysisPlannerService plannerService, AnalysisStepGate stepGate) {
        this.plannerService = plannerService;
        this.stepGate = stepGate;
    }

    public Map<String, Object> execute(OverAllState state) {
        AiChatRequest request = AiAnalysisGraphStateCoercion.requireRequest(state);
        Optional<Map<String, Object>> skipped = stepGate.skipUnlessEnabled(
                AiAnalysisSteps.PLANNER,
                state,
                Map.of(AiAnalysisGraphKeys.PLAN, plannerService.baselinePlan(request))
        );
        if (skipped.isPresent()) {
            return skipped.get();
        }
        String prompt = state.value(AiAnalysisGraphKeys.PROMPT, "");
        long stepStart = AnalysisStepRunner.start();

        AnalysisStepRunner.running(AiAnalysisSteps.PLANNER, "生成分析计划");
        AiAnalysisPlan plan = plannerService.plan(request, prompt);

        Map<String, Object> detail = new LinkedHashMap<>();
        detail.put("mode", plan.mode());
        detail.put("requiresPython", plan.requiresPython());
        detail.put("federated", plan.federated());
        detail.put("targets", plan.targetLabels());
        AnalysisStepRunner.ok(AiAnalysisSteps.PLANNER, "计划已生成", stepStart, detail);

        return Map.of(AiAnalysisGraphKeys.PLAN, plan);
    }
}
