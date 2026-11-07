package org.apache.datawise.backend.ai.domain;

/**
 * 分析报告（Markdown + HTML，供导出与前端展示）
 */
public record AiAnalysisReportDto(
        String markdown,
        String html
) {
}
