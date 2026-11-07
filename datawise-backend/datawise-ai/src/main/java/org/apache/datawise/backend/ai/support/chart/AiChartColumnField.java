package org.apache.datawise.backend.ai.support.chart;

import java.util.Locale;

public record AiChartColumnField(String name, String key, boolean numeric) {

    public String label() {
        return name;
    }

    public boolean timeLike() {
        return AiChartFieldClassifier.isTimeLike(name);
    }
}
