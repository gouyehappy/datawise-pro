package org.apache.datawise.backend.ai.analysis.graph.nodes;

import com.alibaba.cloud.ai.graph.OverAllState;
import org.apache.datawise.backend.ai.analysis.AiAnalysisSteps;
import org.apache.datawise.backend.ai.analysis.graph.state.AiAnalysisGraphKeys;
import org.apache.datawise.backend.ai.analysis.graph.state.AiAnalysisGraphStateCoercion;
import org.apache.datawise.backend.ai.analysis.graph.support.AnalysisStepGate;
import org.apache.datawise.backend.ai.analysis.graph.support.AnalysisStepRunner;
import org.apache.datawise.backend.ai.support.AiCallLogger;
import org.apache.datawise.backend.ai.support.AiChartPlanner;
import org.apache.datawise.backend.ai.domain.AiAnalysisContextDto;
import org.apache.datawise.backend.ai.domain.AiChartSpecDto;
import org.apache.datawise.backend.ai.domain.AiChatRequest;
import org.apache.datawise.backend.domain.ExecuteSqlResult;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 步骤 7/8：根据查询结果列与行规划图表 spec（可为 null）。
 * 多轮追问时优先使用 {@link AiAnalysisContextDto#previousChartType()}。
 */
@Component
public class ChartAnalysisNode {

    private static final Logger log = LoggerFactory.getLogger(ChartAnalysisNode.class);

    private final AnalysisStepGate stepGate;

    public ChartAnalysisNode(AnalysisStepGate stepGate) {
        this.stepGate = stepGate;
    }

    public Map<String, Object> execute(OverAllState state) {
        Map<String, Object> clearedChart = new LinkedHashMap<>();
        clearedChart.put(AiAnalysisGraphKeys.CHART, null);
        var skipped = stepGate.skipUnlessEnabled(AiAnalysisSteps.CHART, state, clearedChart);
        if (skipped.isPresent()) {
            return skipped.get();
        }
        AiChatRequest request = AiAnalysisGraphStateCoercion.requireRequest(state);
        String prompt = state.value(AiAnalysisGraphKeys.PROMPT, "");
        ExecuteSqlResult result = AiAnalysisGraphStateCoercion.requireExecuteResult(state);
        AiAnalysisContextDto context = request.analysisContext();
        String preferredChartType = context != null ? context.previousChartType() : null;
        long stepStart = AnalysisStepRunner.start();

        AnalysisStepRunner.running(AiAnalysisSteps.CHART, "规划图表");
        AiChartSpecDto chart = AiChartPlanner.plan(
                prompt,
                result.columns(),
                result.rows(),
                preferredChartType
        );

        Map<String, Object> chartDetail = new LinkedHashMap<>();
        chartDetail.put("chartType", chart != null ? chart.type() : "none");
        if (preferredChartType != null && !preferredChartType.isBlank()) {
            chartDetail.put("preferredChartType", preferredChartType);
        }

        Map<String, Object> updates = new LinkedHashMap<>();
        updates.put(AiAnalysisGraphKeys.CHART, chart);

        if (chart == null) {
            String failureReason = AiChartPlanner.explainFailure(result.columns(), result.rows());
            chartDetail.put("reason", failureReason);
            AnalysisStepRunner.failed(AiAnalysisSteps.CHART, failureReason);
            AiCallLogger.logAnalysisStep(log, "chart", "type", chartDetail.get("chartType"));
            updates.put(AiAnalysisGraphKeys.CHART_ERROR, failureReason);
            return updates;
        }

        String message = "图表已生成";
        AnalysisStepRunner.ok(AiAnalysisSteps.CHART, message, stepStart, chartDetail);
        AiCallLogger.logAnalysisStep(log, "chart", "type", chartDetail.get("chartType"));
        return updates;
    }
}
