package org.apache.datawise.backend.ai.analysis.route;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class AiAnalysisStepRouteServiceTest {

    private final AiAnalysisStepRouteService service =
            new AiAnalysisStepRouteService(null, new ObjectMapper());

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
    void parseRouteUsesFirstJsonObjectIgnoringTrailingProse() throws Exception {
        String raw = """
                Here is the plan:
                {"disabledSteps":["python","chart"],"rationale":"first object"}
                trailing junk {"disabledSteps":["report"],"rationale":"second"}
                """;
        var node = service.extractFirstJsonObject(raw);
        assertEquals("first object", node.path("rationale").asText());
        assertEquals(2, node.path("disabledSteps").size());

        var route = service.parseRoute(raw, "统计订单数");
        assertTrue(route.disabledSteps().contains("chart"));
        assertTrue(route.disabledSteps().contains("python"));
        assertFalse(route.disabledSteps().contains("report"));
    }

    @Test
    void parseRouteFallsBackToMockWhenJsonMissing() {
        var route = service.parseRoute("not json at all", "随便看看");
        assertFalse(
                route.disabledSteps().contains("summary") && route.disabledSteps().contains("report")
        );
    }

    @Test
    void extractBalancedJsonObjectStopsAtMatchingBrace() {
        String extracted = AiAnalysisStepRouteService.extractBalancedJsonObject(
                "{\"a\":1} trailing {\"b\":2}"
        );
        assertEquals("{\"a\":1}", extracted);
    }

    @Test
    void snippetForLogTruncatesLongRaw() {
        String longRaw = "x".repeat(200);
        String snippet = AiAnalysisStepRouteService.snippetForLog(longRaw);
        assertTrue(snippet.length() < longRaw.length());
        assertTrue(snippet.endsWith("..."));
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
