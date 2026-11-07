package org.apache.datawise.backend.ai.support.chart;

import java.util.List;
import java.util.Locale;

/**
 * 根据 prompt、字段特征与行数推断图表类型（bar / line / pie）。
 */
public final class AiChartTypeResolver {

    private static final int PIE_MAX_ROWS = 8;

    private AiChartTypeResolver() {
    }

    public static String resolve(
            String prompt,
            AiChartColumnField category,
            List<AiChartColumnField> metrics,
            int rowCount,
            String preferredChartType
    ) {
        String normalizedPreferred = normalize(preferredChartType);
        if (normalizedPreferred != null) {
            return normalizedPreferred;
        }
        return infer(prompt, category, metrics, rowCount);
    }

    static String normalize(String raw) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        String lower = raw.trim().toLowerCase(Locale.ROOT);
        if (lower.contains("bar") || lower.contains("柱")) {
            return "bar";
        }
        if (lower.contains("line") || lower.contains("折线") || lower.contains("趋势")) {
            return "line";
        }
        if (lower.contains("pie") || lower.contains("饼")) {
            return "pie";
        }
        return switch (lower) {
            case "bar", "line", "pie" -> lower;
            default -> null;
        };
    }

    private static String infer(
            String prompt,
            AiChartColumnField category,
            List<AiChartColumnField> metrics,
            int rowCount
    ) {
        String lower = prompt != null ? prompt.toLowerCase(Locale.ROOT) : "";
        if (lower.contains("柱状") || lower.contains("bar chart") || lower.contains("bar图") || lower.contains("bar ")) {
            return "bar";
        }
        if (lower.contains("折线") || lower.contains("line chart") || lower.contains("趋势图")) {
            return "line";
        }
        if (lower.contains("占比") || lower.contains("比例") || lower.contains("pie") || lower.contains("proportion")
                || lower.contains("饼图")) {
            return "pie";
        }
        if (category.timeLike()) {
            return "line";
        }
        if (rowCount <= PIE_MAX_ROWS && metrics.size() == 1 && looksLikeShareQuestion(lower)) {
            return "pie";
        }
        return "bar";
    }

    private static boolean looksLikeShareQuestion(String lower) {
        return lower.contains("分布") || lower.contains("占比") || lower.contains("构成");
    }
}
