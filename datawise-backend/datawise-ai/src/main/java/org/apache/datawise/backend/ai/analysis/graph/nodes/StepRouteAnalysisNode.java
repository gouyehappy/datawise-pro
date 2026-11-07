package org.apache.datawise.backend.ai.analysis.graph.nodes;

import com.alibaba.cloud.ai.graph.OverAllState;
import org.apache.datawise.backend.ai.analysis.AiAnalysisSteps;
import org.apache.datawise.backend.ai.analysis.graph.state.AiAnalysisGraphKeys;
import org.apache.datawise.backend.ai.analysis.graph.state.AiAnalysisGraphStateCoercion;
import org.apache.datawise.backend.ai.analysis.graph.support.AnalysisStepRunner;
import org.apache.datawise.backend.ai.analysis.route.AiAnalysisStepRouteService;
import org.apache.datawise.backend.ai.domain.AiChatRequest;
import org.apache.datawise.backend.ai.domain.AiAnalysisStepRoute;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 步骤：根据分析模式（快速/智能/自定义）决定当次可选步骤
 */
@Component
public class StepRouteAnalysisNode {

    private final AiAnalysisStepRouteService stepRouteService;

    public StepRouteAnalysisNode(AiAnalysisStepRouteService stepRouteService) {
        this.stepRouteService = stepRouteService;
    }

    public Map<String, Object> execute(OverAllState state) {
        AiChatRequest request = AiAnalysisGraphStateCoercion.requireRequest(state);
        String prompt = state.value(AiAnalysisGraphKeys.PROMPT, "");
        String mode = AiAnalysisStepRouteService.normalizeMode(request.analysisMode());
        long stepStart = AnalysisStepRunner.start();

        AnalysisStepRunner.running(AiAnalysisSteps.STEP_ROUTE, runningMessage(mode));
        AiAnalysisStepRoute route = switch (mode) {
            case "quick" -> stepRouteService.planQuick();
            case "custom" -> stepRouteService.planCustom(request);
            default -> stepRouteService.planSmart(request, prompt);
        };

        Map<String, Object> detail = new LinkedHashMap<>();
        detail.put("analysisMode", mode);
        detail.put("disabledSteps", route.disabledSteps());
        AnalysisStepRunner.ok(AiAnalysisSteps.STEP_ROUTE, route.rationale(), stepStart, detail);

        return Map.of(
                AiAnalysisGraphKeys.STEP_ROUTE, route,
                AiAnalysisGraphKeys.RUN_DISABLED_STEPS, route.disabledSteps()
        );
    }

    private static String runningMessage(String mode) {
        return switch (mode) {
            case "quick" -> "应用快速分析步骤集";
            case "custom" -> "读取自定义步骤配置";
            default -> "LLM 规划当次分析步骤";
        };
    }
}
