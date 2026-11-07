package org.apache.datawise.backend.ai.analysis.graph.runtime;

import com.alibaba.cloud.ai.graph.OverAllState;
import com.alibaba.cloud.ai.graph.action.EdgeAction;
import org.apache.datawise.backend.ai.analysis.AiAnalysisSteps;
import org.apache.datawise.backend.ai.analysis.graph.state.AiAnalysisGraphKeys;
import org.apache.datawise.backend.ai.config.AiPythonProperties;
import org.springframework.stereotype.Component;

/**
 * python_execute 之后的路由：成功 / 重试生成 / 失败终止
 */
@Component
public class AiAnalysisPythonRouter {

    private final int maxRetries;

    public AiAnalysisPythonRouter(AiPythonProperties pythonProperties) {
        this.maxRetries = pythonProperties.getMaxRetries();
    }

    public String route(OverAllState state) {
        boolean ok = state.value(AiAnalysisGraphKeys.PYTHON_OK, Boolean.class).orElse(Boolean.FALSE);
        if (ok) {
            return AiAnalysisGraphKeys.ROUTE_PYTHON_OK;
        }
        int retryCount = state.value(AiAnalysisGraphKeys.PYTHON_RETRY_COUNT, 0);
        if (retryCount <= maxRetries) {
            return AiAnalysisGraphKeys.ROUTE_PYTHON_RETRY;
        }
        return AiAnalysisGraphKeys.ROUTE_PYTHON_FAILED;
    }

    public EdgeAction edgeAction() {
        return this::route;
    }

    public static String retryTarget() {
        return AiAnalysisSteps.PYTHON_GENERATE;
    }

    public static String okTarget() {
        return AiAnalysisSteps.PYTHON_ANALYZE;
    }

    public static String failedTarget() {
        return AiAnalysisGraphKeys.STEP_ANALYSIS_FAILED;
    }
}
