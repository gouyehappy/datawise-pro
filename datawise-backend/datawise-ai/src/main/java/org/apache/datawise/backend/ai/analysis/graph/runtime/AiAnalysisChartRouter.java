package org.apache.datawise.backend.ai.analysis.graph.runtime;

import com.alibaba.cloud.ai.graph.OverAllState;
import com.alibaba.cloud.ai.graph.action.EdgeAction;
import org.apache.datawise.backend.ai.analysis.AiAnalysisSteps;
import org.apache.datawise.backend.ai.analysis.graph.state.AiAnalysisGraphKeys;
import org.springframework.stereotype.Component;

/**
 * chart 之后的路由：成功进入 summary / 失败终止
 */
@Component
public final class AiAnalysisChartRouter {

    public String route(OverAllState state) {
        String chartError = state.value(AiAnalysisGraphKeys.CHART_ERROR, "");
        if (chartError != null && !chartError.isBlank()) {
            return AiAnalysisGraphKeys.ROUTE_POST_CHART_FAILED;
        }
        return AiAnalysisGraphKeys.ROUTE_POST_CHART_OK;
    }

    public EdgeAction edgeAction() {
        return this::route;
    }

    public static String summaryTarget() {
        return AiAnalysisSteps.SUMMARY;
    }

    public static String failedTarget() {
        return AiAnalysisGraphKeys.STEP_ANALYSIS_FAILED;
    }
}
