package org.apache.datawise.backend.ai.analysis.graph;

import com.alibaba.cloud.ai.graph.OverAllState;
import org.apache.datawise.backend.ai.analysis.graph.runtime.AiAnalysisChartRouter;
import org.apache.datawise.backend.ai.analysis.graph.state.AiAnalysisGraphKeys;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

class AiAnalysisChartRouterTest {

    private final AiAnalysisChartRouter router = new AiAnalysisChartRouter();

    @Test
    void routesToSummaryWhenChartSucceededOrSkipped() {
        OverAllState state = new OverAllState(java.util.Map.of(AiAnalysisGraphKeys.CHART, java.util.Map.of()));
        assertEquals(AiAnalysisGraphKeys.ROUTE_POST_CHART_OK, router.route(state));
    }

    @Test
    void routesToFailedWhenChartErrorPresent() {
        OverAllState state = new OverAllState(java.util.Map.of(
                AiAnalysisGraphKeys.CHART_ERROR,
                "查询结果缺少可用的数值指标（共 1 行、2 列），无法生成图表"
        ));
        assertEquals(AiAnalysisGraphKeys.ROUTE_POST_CHART_FAILED, router.route(state));
    }
}
