package org.apache.datawise.backend.ai.analysis.route;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class AiAnalysisStepRouteServiceTest {

    private final AiAnalysisStepRouteService service = new AiAnalysisStepRouteService(null, null);

    @Test
    void parseRouteDisablesChartForSimplePrompt() {
        String json = """
                {"disabledSteps":["planner","evidence","python","chart","report"],"rationale":"简单统计"}
                """;
        var route = service.parseRoute(json, "统计订单数");
        assertTrue(route.disabledSteps().contains("chart"));
    }

    @Test
    void parseRouteKeepsChartWhenTrendRequested() {
        String json = """
                {"disabledSteps":["planner","evidence","python","report"],"rationale":"需要趋势图"}
                """;
        var route = service.parseRoute(json, "分析销售趋势并画图");
        assertFalse(route.disabledSteps().contains("chart"));
    }

    @Test
    void mockRouteNeverDisablesSummaryAndReportTogether() {
        var route = service.parseRoute("", "随便看看");
        assertFalse(
                route.disabledSteps().contains("summary") && route.disabledSteps().contains("report")
        );
    }

    @Test
    void quickPresetMatchesFrontend() {
        assertTrue(service.quickDisabledSteps().containsAll(List.of("planner", "evidence", "python", "chart", "report")));
    }
}
