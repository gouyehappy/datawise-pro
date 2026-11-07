package org.apache.datawise.backend.ai.analysis.graph.runtime;

import com.alibaba.cloud.ai.graph.OverAllState;
import com.alibaba.cloud.ai.graph.action.EdgeAction;
import org.apache.datawise.backend.ai.analysis.AiAnalysisSteps;
import org.apache.datawise.backend.ai.analysis.graph.state.AiAnalysisGraphKeys;
import org.apache.datawise.backend.ai.analysis.graph.support.AiAnalysisPlanReader;
import org.apache.datawise.backend.ai.analysis.policy.AiAnalysisStepPolicy;
import org.apache.datawise.backend.ai.domain.AiAnalysisPlan;
import org.springframework.stereotype.Component;

/**
 * sql_execute 之后的路由：失败终止 / 进入 Python 链 / 直接进入 chart
 */
@Component
public class AiAnalysisExecuteRouter {

    private final AiAnalysisStepPolicy stepPolicy;

    public AiAnalysisExecuteRouter(AiAnalysisStepPolicy stepPolicy) {
        this.stepPolicy = stepPolicy;
    }

    public String route(OverAllState state) {
        boolean ok = state.value(AiAnalysisGraphKeys.EXECUTION_OK, Boolean.class).orElse(Boolean.FALSE);
        if (!ok) {
            return AiAnalysisGraphKeys.ROUTE_EXECUTE_FAILED;
        }
        AiAnalysisPlan plan = AiAnalysisPlanReader.read(state);
        if (plan != null && plan.requiresPython() && stepPolicy.isPythonEnabled(state)) {
            return AiAnalysisGraphKeys.ROUTE_POST_EXECUTE_PYTHON;
        }
        return AiAnalysisGraphKeys.ROUTE_POST_EXECUTE_CHART;
    }

    public EdgeAction edgeAction() {
        return this::route;
    }

    public static String failedTarget() {
        return AiAnalysisGraphKeys.STEP_ANALYSIS_FAILED;
    }

    public static String pythonTarget() {
        return AiAnalysisSteps.PYTHON_GENERATE;
    }

    public static String chartTarget() {
        return AiAnalysisSteps.CHART;
    }
}
