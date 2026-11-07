package org.apache.datawise.backend.ai.support.chart;

import java.util.ArrayList;
import java.util.List;

/**
 * 从已分类字段中选取图表维度（X）与指标（Y）。
 */
public final class AiChartFieldPicker {

    private AiChartFieldPicker() {
    }

    public static AiChartColumnField pickCategory(List<AiChartColumnField> fields) {
        for (AiChartColumnField field : fields) {
            if (!field.numeric() && field.timeLike()) {
                return field;
            }
        }
        for (AiChartColumnField field : fields) {
            if (!field.numeric()) {
                return field;
            }
        }
        return fields.get(0);
    }

    public static List<AiChartColumnField> pickMetrics(List<AiChartColumnField> fields, AiChartColumnField category) {
        List<AiChartColumnField> metrics = new ArrayList<>();
        for (AiChartColumnField field : fields) {
            if (category != null && field.key().equals(category.key())) {
                continue;
            }
            if (field.numeric()) {
                metrics.add(field);
            }
        }
        if (!metrics.isEmpty()) {
            return metrics;
        }
        if (fields.size() >= 2) {
            AiChartColumnField fallback = fields.stream()
                    .filter(field -> category == null || !field.key().equals(category.key()))
                    .findFirst()
                    .orElse(null);
            if (fallback != null) {
                metrics.add(fallback);
            }
        }
        return metrics;
    }
}
