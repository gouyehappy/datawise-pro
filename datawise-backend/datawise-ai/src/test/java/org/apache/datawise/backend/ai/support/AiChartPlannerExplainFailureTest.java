package org.apache.datawise.backend.ai.support;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class AiChartPlannerExplainFailureTest {

    @Test
    void explainsEmptyRows() {
        String reason = AiChartPlanner.explainFailure(
                List.of(Map.of("name", "id", "key", "id")),
                List.of()
        );
        assertEquals("查询结果为空（0 行），无法生成图表", reason);
    }

    @Test
    void explainsMissingNumericMetrics() {
        String reason = AiChartPlanner.explainFailure(
                List.of(Map.of("name", "label", "key", "label")),
                List.of(Map.of("label", "only-value"))
        );
        assertTrue(reason.contains("缺少可用的数值指标"));
    }
}
