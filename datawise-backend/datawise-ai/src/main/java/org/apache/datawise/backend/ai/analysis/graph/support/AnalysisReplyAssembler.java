package org.apache.datawise.backend.ai.analysis.graph.support;

import com.alibaba.cloud.ai.graph.OverAllState;
import org.apache.datawise.backend.ai.analysis.AiAnalysisSteps;
import org.apache.datawise.backend.ai.analysis.graph.state.AiAnalysisGraphKeys;
import org.apache.datawise.backend.ai.analysis.graph.state.AiAnalysisGraphStateCoercion;
import org.apache.datawise.backend.ai.analysis.policy.AiAnalysisStepPolicy;
import org.apache.datawise.backend.ai.domain.AiAnalysisReportDto;
import org.apache.datawise.backend.ai.domain.AiChartSpecDto;
import org.apache.datawise.backend.ai.domain.AiChatReply;
import org.apache.datawise.backend.domain.ExecuteSqlResult;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 从图状态组装最终 {@link AiChatReply}
 */
public final class AnalysisReplyAssembler {

    private AnalysisReplyAssembler() {
    }

    public static Map<String, Object> replyUpdates(OverAllState state) {
        return replyUpdates(state, null);
    }

    public static Map<String, Object> replyUpdates(OverAllState state, AiAnalysisStepPolicy stepPolicy) {
        Map<String, Object> updates = new LinkedHashMap<>();
        updates.put(AiAnalysisGraphKeys.REPLY, buildReply(state, stepPolicy));
        return updates;
    }

    public static AiChatReply buildReply(OverAllState state) {
        return buildReply(state, null);
    }

    public static AiChatReply buildReply(OverAllState state, AiAnalysisStepPolicy stepPolicy) {
        String summary = state.value(AiAnalysisGraphKeys.SUMMARY, "");
        if (summary == null || summary.isBlank()) {
            summary = state.value(AiAnalysisGraphKeys.PROMPT, "分析完成");
        }
        String safeSql = state.value(AiAnalysisGraphKeys.SAFE_SQL, "");
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
        if (report != null || (pythonInsight != null && !pythonInsight.isBlank())) {
            return AiChatReply.analysisExtended(summary, safeSql, columns, rows, chart, report, pythonInsight);
        }
        return AiChatReply.analysis(summary, safeSql, columns, rows, chart);
    }
}
