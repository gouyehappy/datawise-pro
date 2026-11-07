package org.apache.datawise.backend.ai.domain;

import java.util.List;

/**
 * 前端 ECharts 渲染用的图表描述
 */
public record AiChartSpecDto(
        String type,
        String title,
        String xField,
        List<String> yFields,
        List<String> seriesNames
) {
}
