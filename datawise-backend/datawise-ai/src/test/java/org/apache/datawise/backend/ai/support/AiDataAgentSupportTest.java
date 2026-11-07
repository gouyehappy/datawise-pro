package org.apache.datawise.backend.ai.support;

import org.apache.datawise.backend.ai.support.AiAnalysisIntentDetector;
import org.apache.datawise.backend.ai.support.AiChartPlanner;
import org.apache.datawise.backend.ai.support.AiSqlSafetyChecker;
import org.apache.datawise.backend.ai.domain.AiChartSpecDto;
import org.apache.datawise.backend.ai.domain.AiDatabaseTargetDto;
import org.junit.jupiter.api.Test;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class AiDataAgentSupportTest {

    @Test
    void detectsAnalysisIntentWhenScopeSelected() {
        List<AiDatabaseTargetDto> targets = List.of(new AiDatabaseTargetDto(
                "conn-1",
                "MySQL",
                "admin_db",
                "admin_db",
                null,
                "mysql"
        ));
        assertTrue(AiAnalysisIntentDetector.isAnalysisIntent("analyze yearly sales", targets));
    }

    @Test
    void detectsFollowUpIntentWhenPriorContextPresent() {
        List<AiDatabaseTargetDto> targets = List.of(new AiDatabaseTargetDto(
                "conn-1",
                "MySQL",
                "admin_db",
                "admin_db",
                null,
                "mysql"
        ));
        var context = new org.apache.datawise.backend.ai.domain.AiAnalysisContextDto(
                "SELECT month, SUM(amount) FROM sales GROUP BY month",
                "sales trend up",
                "line"
        );
        assertTrue(AiAnalysisIntentDetector.isAnalysisIntent("Q1 only", targets, context));
        assertTrue(AiAnalysisIntentDetector.isAnalysisIntent("switch to bar chart", targets, context));
    }

    @Test
    void skipsFollowUpWithoutPriorContext() {
        List<AiDatabaseTargetDto> targets = List.of(new AiDatabaseTargetDto(
                "conn-1",
                "MySQL",
                "admin_db",
                "admin_db",
                null,
                "mysql"
        ));
        assertTrue(!AiAnalysisIntentDetector.isAnalysisIntent("Q1 only", targets));
    }

    @Test
    void plansBarChartWhenFollowUpRequestsBar() {
        List<Map<String, Object>> columns = List.of(
                column("month", "month"),
                column("total_sales", "total_sales")
        );
        List<Map<String, Object>> rows = List.of(
                row("month", "2026-01", "total_sales", 120),
                row("month", "2026-02", "total_sales", 156)
        );

        AiChartSpecDto chart = AiChartPlanner.plan("switch to bar chart", columns, rows);
        assertNotNull(chart);
        assertEquals("bar", chart.type());
    }

    @Test
    void skipsAnalysisForQueryResultSummaryPrompt() {
        List<AiDatabaseTargetDto> targets = List.of(new AiDatabaseTargetDto(
                "conn-1",
                "MySQL",
                "admin_db",
                "admin_db",
                null,
                "mysql"
        ));
        String prompt = """
                Summarize this SQL query result for a data analyst. Reply in Chinese using 3-6 concise bullet points.
                Sampling mode: sample
                """;
        assertTrue(!AiAnalysisIntentDetector.isAnalysisIntent(prompt, targets));
    }

    @Test
    void skipsAnalysisForExplainPrompt() {
        List<AiDatabaseTargetDto> targets = List.of(new AiDatabaseTargetDto(
                "conn-1",
                "MySQL",
                "admin_db",
                "admin_db",
                null,
                "mysql"
        ));
        assertTrue(!AiAnalysisIntentDetector.isAnalysisIntent("explain this SQL", targets));
    }

    @Test
    void allowsReadOnlySelectOnly() {
        String sql = AiSqlSafetyChecker.requireReadOnlySelect("-- AI: test\nSELECT 1");
        assertTrue(sql.contains("SELECT 1"));
        assertThrows(IllegalArgumentException.class, () ->
                AiSqlSafetyChecker.requireReadOnlySelect("DELETE FROM user")
        );
    }

    @Test
    void plansBarChartForCategoryAndMetric() {
        List<Map<String, Object>> columns = List.of(
                column("month", "month"),
                column("total_sales", "total_sales")
        );
        List<Map<String, Object>> rows = List.of(
                row("month", "2026-01", "total_sales", 120),
                row("month", "2026-02", "total_sales", 156)
        );

        AiChartSpecDto chart = AiChartPlanner.plan("analyze yearly sales trend", columns, rows);
        assertNotNull(chart);
        assertEquals("line", chart.type());
        assertEquals("month", chart.xField());
        assertEquals(List.of("total_sales"), chart.yFields());
    }

    private static Map<String, Object> column(String name, String key) {
        Map<String, Object> column = new LinkedHashMap<>();
        column.put("name", name);
        column.put("key", key);
        return column;
    }

    private static Map<String, Object> row(String k1, Object v1, String k2, Object v2) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put(k1, v1);
        row.put(k2, v2);
        return row;
    }
}
