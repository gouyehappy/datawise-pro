package org.apache.datawise.backend.ai.analysis.graph.runtime;

import com.alibaba.cloud.ai.graph.OverAllState;
import com.alibaba.cloud.ai.graph.action.EdgeAction;
import org.apache.datawise.backend.ai.analysis.AiAnalysisSteps;
import org.apache.datawise.backend.ai.analysis.graph.state.AiAnalysisGraphKeys;
import org.apache.datawise.backend.ai.config.AiAnalysisProperties;
import org.springframework.stereotype.Component;

/**
 * sql_validate 之后的路由：通过 / 重试生成 / 失败终止
 */
@Component
public final class AiAnalysisValidateRouter {

    private final int maxSqlRetries;

    public AiAnalysisValidateRouter(AiAnalysisProperties analysisProperties) {
        this.maxSqlRetries = analysisProperties.getRetry().getMaxSqlValidationRetries();
    }

    public String route(OverAllState state) {
        boolean ok = state.value(AiAnalysisGraphKeys.VALIDATION_OK, Boolean.class).orElse(Boolean.FALSE);
        if (ok) {
            return AiAnalysisGraphKeys.ROUTE_VALIDATE_OK;
        }
        int retryCount = state.value(AiAnalysisGraphKeys.SQL_RETRY_COUNT, 0);
        if (retryCount <= maxSqlRetries) {
            return AiAnalysisGraphKeys.ROUTE_VALIDATE_RETRY;
        }
        return AiAnalysisGraphKeys.ROUTE_VALIDATE_FAILED;
    }

    public EdgeAction edgeAction() {
        return this::route;
    }

    public static String retryTarget() {
        return AiAnalysisSteps.SQL_GENERATE;
    }

    public static String failedTarget() {
        return AiAnalysisGraphKeys.STEP_ANALYSIS_FAILED;
    }

    public static String okTarget() {
        return AiAnalysisSteps.SQL_EXECUTE;
    }
}
