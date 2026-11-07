package org.apache.datawise.backend.ai.analysis.graph.support;

import com.alibaba.cloud.ai.graph.OverAllState;
import org.apache.datawise.backend.ai.analysis.graph.state.AiAnalysisGraphKeys;
import org.apache.datawise.backend.ai.domain.AiAnalysisPlan;

import java.util.List;
import java.util.Map;

public final class AiAnalysisPlanReader {

    private AiAnalysisPlanReader() {
    }

    public static AiAnalysisPlan requirePlan(OverAllState state) {
        AiAnalysisPlan plan = read(state);
        if (plan == null) {
            return AiAnalysisPlan.sqlOnly(List.of());
        }
        return plan;
    }

    public static AiAnalysisPlan read(OverAllState state) {
        return plan(state.value(AiAnalysisGraphKeys.PLAN).orElse(null));
    }

    public static AiAnalysisPlan plan(Object raw) {
        if (raw instanceof AiAnalysisPlan plan) {
            return plan;
        }
        if (!(raw instanceof Map<?, ?> map)) {
            return null;
        }
        Object mode = map.get("mode");
        boolean requiresPython = Boolean.TRUE.equals(map.get("requiresPython"));
        boolean federated = Boolean.TRUE.equals(map.get("federated"));
        List<String> labels = List.of();
        Object labelsRaw = map.get("targetLabels");
        if (labelsRaw instanceof List<?> list) {
            labels = list.stream().map(String::valueOf).toList();
        }
        return new AiAnalysisPlan(
                mode != null ? String.valueOf(mode) : AiAnalysisPlan.MODE_SQL_ONLY,
                requiresPython,
                federated,
                labels
        );
    }
}
