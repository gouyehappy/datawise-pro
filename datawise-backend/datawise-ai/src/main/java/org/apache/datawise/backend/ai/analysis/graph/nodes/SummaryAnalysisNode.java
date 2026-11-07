package org.apache.datawise.backend.ai.analysis.graph.nodes;

import com.alibaba.cloud.ai.graph.OverAllState;
import org.apache.datawise.backend.ai.analysis.AiAnalysisSteps;
import org.apache.datawise.backend.ai.analysis.graph.state.AiAnalysisGraphKeys;
import org.apache.datawise.backend.ai.analysis.graph.state.AiAnalysisGraphStateCoercion;
import org.apache.datawise.backend.ai.analysis.graph.support.AnalysisReplyAssembler;
import org.apache.datawise.backend.ai.analysis.graph.support.AnalysisStepGate;
import org.apache.datawise.backend.ai.analysis.graph.support.AnalysisStepRunner;
import org.apache.datawise.backend.ai.support.AiAnalysisLlmResolver;
import org.apache.datawise.backend.ai.support.AiCallLogger;
import org.apache.datawise.backend.ai.domain.AiChartSpecDto;
import org.apache.datawise.backend.ai.domain.AiChatRequest;
import org.apache.datawise.backend.domain.ExecuteSqlResult;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.util.Map;

/**
 * 生成自然语言摘要（最终 reply 由 report 节点组装）
 */
@Component
public class SummaryAnalysisNode {

    private static final Logger log = LoggerFactory.getLogger(SummaryAnalysisNode.class);

    private final AnalysisSummaryGenerator summaryGenerator;
    private final AnalysisStepGate stepGate;

    public SummaryAnalysisNode(AnalysisSummaryGenerator summaryGenerator, AnalysisStepGate stepGate) {
        this.summaryGenerator = summaryGenerator;
        this.stepGate = stepGate;
    }

    public Map<String, Object> execute(OverAllState state) {
        String prompt = state.value(AiAnalysisGraphKeys.PROMPT, "分析完成");
        var skipped = stepGate.skipUnlessEnabled(
                AiAnalysisSteps.SUMMARY,
                state,
                Map.of(AiAnalysisGraphKeys.SUMMARY, prompt)
        );
        if (skipped.isPresent()) {
            return skipped.get();
        }
        AiChatRequest request = AiAnalysisGraphStateCoercion.requireRequest(state);
        String safeSql = state.value(AiAnalysisGraphKeys.SAFE_SQL, "");
        ExecuteSqlResult result = AiAnalysisGraphStateCoercion.requireExecuteResult(state);
        AiChartSpecDto chart = AiAnalysisGraphStateCoercion.chart(state);
        String pythonInsight = state.value(AiAnalysisGraphKeys.PYTHON_INSIGHT, "");
        long stepStart = AnalysisStepRunner.start();

        AnalysisStepRunner.running(AiAnalysisSteps.SUMMARY, "生成分析摘要");
        try {
            String summary = summaryGenerator.generate(
                    AiAnalysisLlmResolver.resolve(request, AiAnalysisLlmResolver.ROUTE_SUMMARY),
                    prompt,
                    safeSql,
                    result,
                    chart
            );
            if (pythonInsight != null && !pythonInsight.isBlank()) {
                summary = summary + "\n\nPython 分析补充：\n" + pythonInsight.trim();
            }
            AnalysisStepRunner.ok(
                    AiAnalysisSteps.SUMMARY,
                    "摘要已生成",
                    stepStart,
                    Map.of("replyChars", summary != null ? summary.length() : 0)
            );
            AiCallLogger.logAnalysisStep(log, "summary", "chars", summary != null ? summary.length() : 0);
            return Map.of(AiAnalysisGraphKeys.SUMMARY, summary);
        } catch (RuntimeException ex) {
            AnalysisStepRunner.failed(AiAnalysisSteps.SUMMARY, ex);
            throw new IllegalStateException("分析摘要生成失败: " + AnalysisStepRunner.messageOf(ex), ex);
        }
    }
}
