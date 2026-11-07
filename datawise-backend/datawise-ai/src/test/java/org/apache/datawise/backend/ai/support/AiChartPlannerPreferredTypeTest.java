package org.apache.datawise.backend.ai.support;

import org.apache.datawise.backend.ai.domain.AiChartSpecDto;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;

class AiChartPlannerPreferredTypeTest {

    @Test
    void honorsPreferredChartTypeFromContext() {
        List<Map<String, Object>> columns = List.of(
                Map.of("name", "Month", "key", "month"),
                Map.of("name", "Sales", "key", "sales")
        );
        List<Map<String, Object>> rows = List.of(
                Map.of("month", "Jan", "sales", 10),
                Map.of("month", "Feb", "sales", 20)
        );

        AiChartSpecDto chart = AiChartPlanner.plan("sales trend", columns, rows, "line");

        assertNotNull(chart);
        assertEquals("line", chart.type());
    }
}
