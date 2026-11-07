package org.apache.datawise.backend.ai.domain;

import java.util.List;
import java.util.Map;

public record AiChatReply(
        String reply,
        String mode,
        String sql,
        List<Map<String, Object>> columns,
        List<Map<String, Object>> rows,
        AiChartSpecDto chart,
        AiAnalysisReportDto report,
        String pythonInsight
) {
    public AiChatReply(
            String reply,
            String mode,
            String sql,
            List<Map<String, Object>> columns,
            List<Map<String, Object>> rows,
            AiChartSpecDto chart
    ) {
        this(reply, mode, sql, columns, rows, chart, null, null);
    }

    public static AiChatReply chat(String reply) {
        return new AiChatReply(reply, "chat", null, null, null, null);
    }

    public static AiChatReply analysis(
            String reply,
            String sql,
            List<Map<String, Object>> columns,
            List<Map<String, Object>> rows,
            AiChartSpecDto chart
    ) {
        return new AiChatReply(reply, "analysis", sql, columns, rows, chart);
    }

    public static AiChatReply analysisExtended(
            String reply,
            String sql,
            List<Map<String, Object>> columns,
            List<Map<String, Object>> rows,
            AiChartSpecDto chart,
            AiAnalysisReportDto report,
            String pythonInsight
    ) {
        return new AiChatReply(reply, "analysis", sql, columns, rows, chart, report, pythonInsight);
    }
}
