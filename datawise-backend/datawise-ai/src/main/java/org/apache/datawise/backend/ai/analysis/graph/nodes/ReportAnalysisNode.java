package org.apache.datawise.backend.ai.analysis.graph.nodes;

import com.alibaba.cloud.ai.graph.OverAllState;
import org.apache.datawise.backend.ai.analysis.AiAnalysisSteps;
import org.apache.datawise.backend.ai.analysis.graph.state.AiAnalysisGraphKeys;
import org.apache.datawise.backend.ai.analysis.graph.state.AiAnalysisGraphStateCoercion;
import org.apache.datawise.backend.ai.analysis.graph.support.AnalysisReplyAssembler;
import org.apache.datawise.backend.ai.analysis.graph.support.AnalysisStepGate;
import org.apache.datawise.backend.ai.analysis.policy.AiAnalysisStepPolicy;
import org.apache.datawise.backend.ai.analysis.graph.support.AnalysisStepRunner;
import org.apache.datawise.backend.ai.analysis.report.AnalysisReportGenerator;
import org.apache.datawise.backend.ai.domain.AiAnalysisReportDto;
import org.apache.datawise.backend.ai.domain.AiChartSpecDto;
import org.apache.datawise.backend.ai.domain.AiChatReply;
import org.apache.datawise.backend.domain.ExecuteSqlResult;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.Map;

@Component
public class ReportAnalysisNode {

    private final AnalysisReportGenerator reportGenerator;
    private final AnalysisStepGate stepGate;
    private final AiAnalysisStepPolicy stepPolicy;

    public ReportAnalysisNode(
            AnalysisReportGenerator reportGenerator,
            AnalysisStepGate stepGate,
            AiAnalysisStepPolicy stepPolicy
    ) {
        this.reportGenerator = reportGenerator;
        this.stepGate = stepGate;
        this.stepPolicy = stepPolicy;
    }

    public Map<String, Object> execute(OverAllState state) {
        var skipped = stepGate.skipUnlessEnabled(AiAnalysisSteps.REPORT, state, null);
        if (skipped.isPresent()) {
            Map<String, Object> updates = new LinkedHashMap<>(AnalysisReplyAssembler.replyUpdates(state, stepPolicy));
            return updates;
        }

        String prompt = state.value(AiAnalysisGraphKeys.PROMPT, "");
        String summary = state.value(AiAnalysisGraphKeys.SUMMARY, "");
        String safeSql = state.value(AiAnalysisGraphKeys.SAFE_SQL, "");
        ExecuteSqlResult result = AiAnalysisGraphStateCoercion.requireExecuteResult(state);
        AiChartSpecDto chart = AiAnalysisGraphStateCoercion.chart(state);
        String pythonInsight = state.value(AiAnalysisGraphKeys.PYTHON_INSIGHT, "");
        long stepStart = AnalysisStepRunner.start();

        AnalysisStepRunner.running(AiAnalysisSteps.REPORT, "生成分析报告");
        AiAnalysisReportDto report = reportGenerator.generate(
                prompt,
                summary,
                safeSql,
                result,
                chart,
                pythonInsight
        );
        AnalysisStepRunner.ok(
                AiAnalysisSteps.REPORT,
                "报告已生成",
                stepStart,
                Map.of("markdownChars", report.markdown() != null ? report.markdown().length() : 0)
        );

        AiChatReply reply = AiChatReply.analysisExtended(
                summary,
                safeSql,
                result.columns(),
                result.rows(),
                chart,
                report,
                pythonInsight
        );
        return Map.of(
                AiAnalysisGraphKeys.REPORT, report,
                AiAnalysisGraphKeys.REPLY, reply
        );
    }
}
