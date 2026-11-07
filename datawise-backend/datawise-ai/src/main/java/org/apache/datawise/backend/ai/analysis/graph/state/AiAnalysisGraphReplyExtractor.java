package org.apache.datawise.backend.ai.analysis.graph.state;

import com.alibaba.cloud.ai.graph.OverAllState;
import org.apache.datawise.backend.ai.analysis.AiAnalysisSteps;
import org.apache.datawise.backend.ai.analysis.policy.AiAnalysisStepPolicy;
import org.apache.datawise.backend.ai.domain.AiAnalysisReportDto;
import org.apache.datawise.backend.ai.domain.AiChartSpecDto;
import org.apache.datawise.backend.ai.domain.AiChatReply;
import org.apache.datawise.backend.domain.ExecuteSqlResult;

import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * 从 StateGraph 终态解析 {@link AiChatReply}（兼容 Gson 反序列化为 Map）
 */
public final class AiAnalysisGraphReplyExtractor {

    private AiAnalysisGraphReplyExtractor() {
    }

    public static AiChatReply requireReply(OverAllState state) {
        return requireReply(state, null);
    }

    public static AiChatReply requireReply(OverAllState state, AiAnalysisStepPolicy stepPolicy) {
        if (state == null) {
            throw new IllegalStateException("Analysis StateGraph returned empty state");
        }
        Optional<AiChatReply> reply = directReply(state, stepPolicy);
        if (reply.isPresent()) {
            return reply.get();
        }
        return buildFromParts(state, stepPolicy)
                .orElseThrow(() -> new IllegalStateException("Analysis StateGraph missing reply"));
    }

    private static Optional<AiChatReply> directReply(OverAllState state, AiAnalysisStepPolicy stepPolicy) {
        Object raw = state.value(AiAnalysisGraphKeys.REPLY).orElse(null);
        AiChatReply coerced = coerceReply(raw, stepPolicy, state);
        return coerced != null ? Optional.of(coerced) : Optional.empty();
    }

    private static Optional<AiChatReply> buildFromParts(OverAllState state, AiAnalysisStepPolicy stepPolicy) {
        String summary = state.value(AiAnalysisGraphKeys.SUMMARY, "");
        if (summary == null || summary.isBlank()) {
            return Optional.empty();
        }
        String sql = state.value(AiAnalysisGraphKeys.SAFE_SQL, "");
        ExecuteSqlResult result = AiAnalysisGraphStateCoercion.executeResult(
                state.value(AiAnalysisGraphKeys.EXECUTE_RESULT).orElse(null)
        );
        AiChartSpecDto chart = AiAnalysisGraphStateCoercion.chart(
                state.value(AiAnalysisGraphKeys.CHART).orElse(null)
        );
        AiAnalysisReportDto report = AiAnalysisGraphStateCoercion.report(
                state.value(AiAnalysisGraphKeys.REPORT).orElse(null)
        );
        if (stepPolicy != null) {
            if (!stepPolicy.isEnabled(AiAnalysisSteps.CHART, state)) {
                chart = null;
            }
            if (!stepPolicy.isEnabled(AiAnalysisSteps.REPORT, state)) {
                report = null;
            }
        }
        String pythonInsight = state.value(AiAnalysisGraphKeys.PYTHON_INSIGHT, "");
        List<Map<String, Object>> columns = result != null ? result.columns() : List.of();
        List<Map<String, Object>> rows = result != null ? result.rows() : List.of();
        return Optional.of(AiChatReply.analysisExtended(summary, sql, columns, rows, chart, report, pythonInsight));
    }

    @SuppressWarnings("unchecked")
    private static AiChatReply coerceReply(Object raw, AiAnalysisStepPolicy stepPolicy, OverAllState state) {
        if (raw instanceof AiChatReply reply) {
            return reply;
        }
        if (!(raw instanceof Map<?, ?> map)) {
            return null;
        }
        String text = stringValue(map.get("reply"));
        String mode = stringValue(map.get("mode"));
        String sql = stringValue(map.get("sql"));
        List<Map<String, Object>> columns = (List<Map<String, Object>>) map.get("columns");
        List<Map<String, Object>> rows = (List<Map<String, Object>>) map.get("rows");
        AiChartSpecDto chart = AiAnalysisGraphStateCoercion.chart(map.get("chart"));
        AiAnalysisReportDto report = AiAnalysisGraphStateCoercion.report(map.get("report"));
        String pythonInsight = stringValue(map.get("pythonInsight"));
        if (stepPolicy != null && state != null) {
            if (!stepPolicy.isEnabled(AiAnalysisSteps.CHART, state)) {
                chart = null;
            }
            if (!stepPolicy.isEnabled(AiAnalysisSteps.REPORT, state)) {
                report = null;
            }
        }
        if (text == null) {
            return null;
        }
        if ("analysis".equalsIgnoreCase(mode)) {
            if (report != null || (pythonInsight != null && !pythonInsight.isBlank())) {
                return AiChatReply.analysisExtended(text, sql, columns, rows, chart, report, pythonInsight);
            }
            return AiChatReply.analysis(text, sql, columns, rows, chart);
        }
        return AiChatReply.chat(text);
    }

    private static String stringValue(Object value) {
        return value == null ? null : String.valueOf(value);
    }
}
