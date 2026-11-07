package org.apache.datawise.backend.ai.analysis.policy;

import com.alibaba.cloud.ai.graph.OverAllState;
import org.apache.datawise.backend.ai.analysis.AiAnalysisSteps;
import org.apache.datawise.backend.ai.analysis.graph.state.AiAnalysisGraphKeys;
import org.apache.datawise.backend.ai.analysis.graph.state.AiAnalysisGraphStateCoercion;
import org.apache.datawise.backend.ai.analysis.route.AiAnalysisStepRouteService;
import org.apache.datawise.backend.ai.config.AiAnalysisProperties;
import org.apache.datawise.backend.ai.domain.AiChatRequest;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Set;

/**
 * 分析流水线步骤开关：合并 application.yml 默认、分析模式与当次 step_route 禁用列表。
 */
@Component
public class AiAnalysisStepPolicy {

    private final AiAnalysisProperties analysisProperties;

    public AiAnalysisStepPolicy(AiAnalysisProperties analysisProperties) {
        this.analysisProperties = analysisProperties;
    }

    public boolean isEnabled(String step, OverAllState state) {
        String normalized = AiAnalysisSteps.normalize(step);
        if (AiAnalysisSteps.REQUIRED.contains(normalized)) {
            return true;
        }
        boolean enabled = computeEnabled(normalized, state);
        if (AiAnalysisSteps.SUMMARY.equals(normalized) || AiAnalysisSteps.REPORT.equals(normalized)) {
            boolean summary = computeEnabled(AiAnalysisSteps.SUMMARY, state);
            boolean report = computeEnabled(AiAnalysisSteps.REPORT, state);
            if (!summary && !report) {
                return AiAnalysisSteps.SUMMARY.equals(normalized);
            }
        }
        return enabled;
    }

    private boolean computeEnabled(String normalized, OverAllState state) {
        if (AiAnalysisSteps.isPythonStep(normalized) && !analysisProperties.getSteps().isPython()) {
            return false;
        }
        if (!analysisProperties.getSteps().isEnabled(AiAnalysisSteps.configPropertyKey(normalized))) {
            return false;
        }
        return !effectiveDisabledSteps(state).contains(normalized);
    }

    public boolean isPythonEnabled(OverAllState state) {
        if (!analysisProperties.getSteps().isPython()) {
            return false;
        }
        Set<String> disabled = effectiveDisabledSteps(state);
        return !disabled.contains(AiAnalysisSteps.PYTHON_GENERATE) && !disabled.contains("python");
    }

    public boolean requiresReplyProducer(OverAllState state) {
        return isEnabled(AiAnalysisSteps.REPORT, state) || isEnabled(AiAnalysisSteps.SUMMARY, state);
    }

    private Set<String> effectiveDisabledSteps(OverAllState state) {
        String mode = resolveAnalysisMode(state);
        List<String> raw = "custom".equals(mode)
                ? settingsDisabledSteps(state)
                : runDisabledSteps(state);
        return AiAnalysisSteps.expandDisabled(raw);
    }

    private static String resolveAnalysisMode(OverAllState state) {
        if (state == null) {
            return "smart";
        }
        AiChatRequest request = AiAnalysisGraphStateCoercion.chatRequest(
                state.value(AiAnalysisGraphKeys.REQUEST).orElse(null)
        );
        if (request == null) {
            return "smart";
        }
        return AiAnalysisStepRouteService.normalizeMode(request.analysisMode());
    }

    private static List<String> runDisabledSteps(OverAllState state) {
        if (state == null) {
            return List.of();
        }
        Object raw = state.value(AiAnalysisGraphKeys.RUN_DISABLED_STEPS).orElse(null);
        if (!(raw instanceof List<?> list)) {
            return List.of();
        }
        return list.stream().map(String::valueOf).toList();
    }

    private static List<String> settingsDisabledSteps(OverAllState state) {
        if (state == null) {
            return List.of();
        }
        AiChatRequest request = AiAnalysisGraphStateCoercion.chatRequest(
                state.value(AiAnalysisGraphKeys.REQUEST).orElse(null)
        );
        if (request == null || request.disabledAnalysisSteps() == null) {
            return List.of();
        }
        return request.disabledAnalysisSteps();
    }

    public static List<String> configurableSteps() {
        return AiAnalysisSteps.CONFIGURABLE;
    }
}
