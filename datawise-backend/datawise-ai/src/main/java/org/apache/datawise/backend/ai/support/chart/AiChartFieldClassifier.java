package org.apache.datawise.backend.ai.support.chart;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;

/**
 * 根据查询结果样本行推断列类型（数值 / 分类 / 时间）。
 */
public final class AiChartFieldClassifier {

    private AiChartFieldClassifier() {
    }

    public static List<AiChartColumnField> classify(List<Map<String, Object>> columns, List<Map<String, Object>> rows) {
        List<AiChartColumnField> fields = new ArrayList<>();
        for (Map<String, Object> column : columns) {
            AiChartColumnField base = toField(column);
            if (base == null) {
                continue;
            }
            boolean numeric = rows.stream()
                    .limit(20)
                    .map(row -> row.get(base.key()))
                    .filter(Objects::nonNull)
                    .allMatch(AiChartFieldClassifier::isNumericValue);
            fields.add(new AiChartColumnField(base.name(), base.key(), numeric));
        }
        return fields;
    }

    static boolean isTimeLike(String name) {
        String lower = name.toLowerCase(Locale.ROOT);
        return lower.contains("date")
                || lower.contains("time")
                || lower.contains("month")
                || lower.contains("year")
                || lower.contains("day")
                || name.contains("日期")
                || name.contains("时间")
                || name.contains("月")
                || name.contains("年");
    }

    private static AiChartColumnField toField(Map<String, Object> column) {
        if (column == null) {
            return null;
        }
        Object nameObj = column.get("name");
        if (nameObj == null) {
            return null;
        }
        String name = String.valueOf(nameObj);
        String key = column.get("key") != null ? String.valueOf(column.get("key")) : name;
        return new AiChartColumnField(name, key, false);
    }

    private static boolean isNumericValue(Object value) {
        if (value instanceof Number) {
            return true;
        }
        if (value == null) {
            return true;
        }
        String text = String.valueOf(value).trim();
        if (text.isEmpty()) {
            return true;
        }
        try {
            Double.parseDouble(text);
            return true;
        } catch (NumberFormatException ex) {
            return false;
        }
    }
}
