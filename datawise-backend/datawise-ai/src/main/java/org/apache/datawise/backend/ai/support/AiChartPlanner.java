package org.apache.datawise.backend.ai.support;

import org.apache.datawise.backend.ai.domain.AiChartSpecDto;
import org.apache.datawise.backend.ai.support.chart.AiChartColumnField;
import org.apache.datawise.backend.ai.support.chart.AiChartFieldClassifier;
import org.apache.datawise.backend.ai.support.chart.AiChartFieldPicker;
import org.apache.datawise.backend.ai.support.chart.AiChartTypeResolver;

import java.util.List;
import java.util.Map;

public final class AiChartPlanner {

    private AiChartPlanner() {
    }

    public static AiChartSpecDto plan(
            String prompt,
            List<Map<String, Object>> columns,
            List<Map<String, Object>> rows
    ) {
        return plan(prompt, columns, rows, null);
    }

    public static AiChartSpecDto plan(
            String prompt,
            List<Map<String, Object>> columns,
            List<Map<String, Object>> rows,
            String preferredChartType
    ) {
        if (columns == null || columns.isEmpty() || rows == null || rows.isEmpty()) {
            return null;
        }
        List<AiChartColumnField> fields = AiChartFieldClassifier.classify(columns, rows);
        if (fields.isEmpty()) {
            return null;
        }
        AiChartColumnField category = AiChartFieldPicker.pickCategory(fields);
        List<AiChartColumnField> metrics = AiChartFieldPicker.pickMetrics(fields, category);
        if (category == null || metrics.isEmpty()) {
            return null;
        }
        String chartType = AiChartTypeResolver.resolve(
                prompt, category, metrics, rows.size(), preferredChartType
        );
        String title = buildTitle(prompt);
        List<String> yFields = metrics.stream().map(AiChartColumnField::key).toList();
        List<String> seriesNames = metrics.stream().map(AiChartColumnField::label).toList();
        return new AiChartSpecDto(chartType, title, category.key(), yFields, seriesNames);
    }

    public static String explainFailure(List<Map<String, Object>> columns, List<Map<String, Object>> rows) {
        if (columns == null || columns.isEmpty()) {
            return "查询结果没有列信息，无法生成图表";
        }
        if (rows == null || rows.isEmpty()) {
            return "查询结果为空（0 行），无法生成图表";
        }
        List<AiChartColumnField> fields = AiChartFieldClassifier.classify(columns, rows);
        if (fields.isEmpty()) {
            return "查询结果列无法解析，无法生成图表";
        }
        AiChartColumnField category = AiChartFieldPicker.pickCategory(fields);
        List<AiChartColumnField> metrics = AiChartFieldPicker.pickMetrics(fields, category);
        if (category == null) {
            return "查询结果缺少可用的分类维度，无法生成图表";
        }
        if (metrics.isEmpty()) {
            return "查询结果缺少可用的数值指标（共 "
                    + rows.size()
                    + " 行、"
                    + columns.size()
                    + " 列），无法生成图表";
        }
        return "数据不足以生成图表";
    }

    private static String buildTitle(String prompt) {
        if (prompt == null || prompt.isBlank()) {
            return "Analysis";
        }
        String trimmed = prompt.trim().replaceAll("\\s+", " ");
        return trimmed.length() > 40 ? trimmed.substring(0, 40) + "…" : trimmed;
    }
}
