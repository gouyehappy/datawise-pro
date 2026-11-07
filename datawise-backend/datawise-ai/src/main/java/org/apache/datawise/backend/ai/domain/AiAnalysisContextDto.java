package org.apache.datawise.backend.ai.domain;

/**
 * 上一轮分析上下文，供多轮追问（改 SQL / 改图表）
 */
public record AiAnalysisContextDto(
        String previousSql,
        String previousSummary,
        String previousChartType
) {
}
