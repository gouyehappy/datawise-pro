package org.apache.datawise.backend.ai.analysis.graph.nodes;

import org.apache.datawise.backend.ai.support.AiLlmGateway;
import org.apache.datawise.backend.ai.support.AiPromptTemplates;
import org.apache.datawise.backend.ai.domain.AiChartSpecDto;
import org.apache.datawise.backend.ai.domain.AiLlmProfileDto;
import org.apache.datawise.backend.domain.ExecuteSqlResult;
import org.springframework.stereotype.Component;

@Component
public class AnalysisSummaryGenerator {

    private final AiLlmGateway aiLlmGateway;

    public AnalysisSummaryGenerator(AiLlmGateway aiLlmGateway) {
        this.aiLlmGateway = aiLlmGateway;
    }

    public String generate(
            AiLlmProfileDto llm,
            String prompt,
            String sql,
            ExecuteSqlResult result,
            AiChartSpecDto chart
    ) {
        if (aiLlmGateway.isMock(llm)) {
            return mockSummary(prompt, result, chart);
        }
        String systemPrompt = AiPromptTemplates.renderAnalysisSummaryPrompt();
        String userPrompt = AiPromptTemplates.renderAnalysisSummaryUserPrompt(
                prompt,
                sql,
                result.rowCount(),
                result.columns(),
                result.rows(),
                chart
        );
        return aiLlmGateway.complete(llm, systemPrompt, userPrompt, "analysis-summary");
    }

    private String mockSummary(String prompt, ExecuteSqlResult result, AiChartSpecDto chart) {
        StringBuilder builder = new StringBuilder();
        builder.append("已完成数据分析（演示模式）：").append(prompt).append('\n');
        builder.append("共查询到 ").append(result.rowCount()).append(" 行数据。");
        if (chart != null) {
            builder.append(" 已生成 ").append(chart.type()).append(" 图表展示关键指标。");
        }
        return builder.toString();
    }
}
