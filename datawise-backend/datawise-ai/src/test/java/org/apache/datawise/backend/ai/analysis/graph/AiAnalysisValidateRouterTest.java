package org.apache.datawise.backend.ai.analysis.graph;

import com.alibaba.cloud.ai.graph.OverAllState;
import org.apache.datawise.backend.ai.analysis.graph.runtime.AiAnalysisValidateRouter;
import org.apache.datawise.backend.ai.analysis.graph.state.AiAnalysisGraphKeys;
import org.apache.datawise.backend.ai.analysis.AiAnalysisSteps;
import org.apache.datawise.backend.ai.config.AiAnalysisProperties;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

class AiAnalysisValidateRouterTest {

    private AiAnalysisValidateRouter router;

    @BeforeEach
    void setUp() {
        router = new AiAnalysisValidateRouter(new AiAnalysisProperties());
    }

    @Test
    void routesToRetryWhileUnderLimit() {
        OverAllState state = new OverAllState(java.util.Map.of(
                AiAnalysisGraphKeys.VALIDATION_OK, false,
                AiAnalysisGraphKeys.SQL_RETRY_COUNT, 1
        ));
        assertEquals(AiAnalysisGraphKeys.ROUTE_VALIDATE_RETRY, router.route(state));
    }

    @Test
    void routesToOkWhenValidated() {
        OverAllState state = new OverAllState(java.util.Map.of(AiAnalysisGraphKeys.VALIDATION_OK, true));
        assertEquals(AiAnalysisGraphKeys.ROUTE_VALIDATE_OK, router.route(state));
    }

    @Test
    void routesToFailedAfterMaxRetries() {
        OverAllState state = new OverAllState(java.util.Map.of(
                AiAnalysisGraphKeys.VALIDATION_OK, false,
                AiAnalysisGraphKeys.SQL_RETRY_COUNT, 3
        ));
        assertEquals(AiAnalysisGraphKeys.ROUTE_VALIDATE_FAILED, router.route(state));
    }

    @Test
    void okTargetIsSqlExecute() {
        assertEquals(AiAnalysisSteps.SQL_EXECUTE, AiAnalysisValidateRouter.okTarget());
    }
}
