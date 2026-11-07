package org.apache.datawise.backend.ai.analysis.graph;

import com.alibaba.cloud.ai.graph.OverAllState;
import org.apache.datawise.backend.ai.analysis.graph.runtime.AiAnalysisExecuteRouter;
import org.apache.datawise.backend.ai.analysis.graph.state.AiAnalysisGraphKeys;
import org.apache.datawise.backend.ai.analysis.policy.AiAnalysisStepPolicy;
import org.apache.datawise.backend.ai.config.AiAnalysisProperties;
import org.apache.datawise.backend.ai.domain.AiAnalysisPlan;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

class AiAnalysisExecuteRouterTest {

    private AiAnalysisExecuteRouter router;

    @BeforeEach
    void setUp() {
        router = new AiAnalysisExecuteRouter(new AiAnalysisStepPolicy(new AiAnalysisProperties()));
    }

    @Test
    void routesToChartWhenExecutionOkWithoutPython() {
        OverAllState state = new OverAllState(java.util.Map.of(
                AiAnalysisGraphKeys.EXECUTION_OK, true,
                AiAnalysisGraphKeys.PLAN, new AiAnalysisPlan(AiAnalysisPlan.MODE_SQL_ONLY, false, false, java.util.List.of())
        ));
        assertEquals(AiAnalysisGraphKeys.ROUTE_POST_EXECUTE_CHART, router.route(state));
    }

    @Test
    void routesToPythonWhenPlanRequiresPython() {
        OverAllState state = new OverAllState(java.util.Map.of(
                AiAnalysisGraphKeys.EXECUTION_OK, true,
                AiAnalysisGraphKeys.PLAN, new AiAnalysisPlan(AiAnalysisPlan.MODE_SQL_THEN_PYTHON, true, false, java.util.List.of())
        ));
        assertEquals(AiAnalysisGraphKeys.ROUTE_POST_EXECUTE_PYTHON, router.route(state));
    }

    @Test
    void routesToChartWhenPythonDisabledInConfig() {
        AiAnalysisProperties properties = new AiAnalysisProperties();
        properties.getSteps().setPython(false);
        router = new AiAnalysisExecuteRouter(new AiAnalysisStepPolicy(properties));
        OverAllState state = new OverAllState(java.util.Map.of(
                AiAnalysisGraphKeys.EXECUTION_OK, true,
                AiAnalysisGraphKeys.PLAN, new AiAnalysisPlan(AiAnalysisPlan.MODE_SQL_THEN_PYTHON, true, false, java.util.List.of())
        ));
        assertEquals(AiAnalysisGraphKeys.ROUTE_POST_EXECUTE_CHART, router.route(state));
    }

    @Test
    void routesToFailedWhenExecutionNotOk() {
        OverAllState state = new OverAllState(java.util.Map.of(AiAnalysisGraphKeys.EXECUTION_OK, false));
        assertEquals(AiAnalysisGraphKeys.ROUTE_EXECUTE_FAILED, router.route(state));
    }

    @Test
    void chartTargetIsChartStep() {
        assertEquals("chart", AiAnalysisExecuteRouter.chartTarget());
    }
}
