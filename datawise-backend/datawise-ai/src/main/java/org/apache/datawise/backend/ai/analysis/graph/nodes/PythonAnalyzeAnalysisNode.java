package org.apache.datawise.backend.ai.analysis.graph.nodes;

import com.alibaba.cloud.ai.graph.OverAllState;
import org.apache.datawise.backend.ai.analysis.AiAnalysisSteps;
import org.apache.datawise.backend.ai.analysis.graph.state.AiAnalysisGraphKeys;
import org.apache.datawise.backend.ai.analysis.graph.state.AiAnalysisGraphStateCoercion;
import org.apache.datawise.backend.ai.analysis.graph.support.AnalysisStepGate;
import org.apache.datawise.backend.ai.analysis.graph.support.AnalysisStepRunner;
import org.apache.datawise.backend.ai.support.AiAnalysisLlmResolver;
import org.apache.datawise.backend.ai.analysis.python.AnalysisPythonAnalyzer;
import org.apache.datawise.backend.ai.domain.AiChatRequest;
import org.springframework.stereotype.Component;

import java.util.Map;

@Component
public class PythonAnalyzeAnalysisNode {

    private final AnalysisPythonAnalyzer pythonAnalyzer;
    private final AnalysisStepGate stepGate;

    public PythonAnalyzeAnalysisNode(AnalysisPythonAnalyzer pythonAnalyzer, AnalysisStepGate stepGate) {
        this.pythonAnalyzer = pythonAnalyzer;
        this.stepGate = stepGate;
    }

    public Map<String, Object> execute(OverAllState state) {
        var skipped = stepGate.skipUnlessEnabled(
                AiAnalysisSteps.PYTHON_ANALYZE,
                state,
                Map.of(AiAnalysisGraphKeys.PYTHON_INSIGHT, "")
        );
        if (skipped.isPresent()) {
            return skipped.get();
        }
        AiChatRequest request = AiAnalysisGraphStateCoercion.requireRequest(state);
        String prompt = state.value(AiAnalysisGraphKeys.PROMPT, "");
        String pythonStdout = state.value(AiAnalysisGraphKeys.PYTHON_RESULT, "");
        long stepStart = AnalysisStepRunner.start();

        AnalysisStepRunner.running(AiAnalysisSteps.PYTHON_ANALYZE, "解读 Python 分析结果");
        String insight = pythonAnalyzer.analyze(
                AiAnalysisLlmResolver.resolve(request, AiAnalysisLlmResolver.ROUTE_PYTHON),
                prompt,
                pythonStdout
        );
        AnalysisStepRunner.ok(
                AiAnalysisSteps.PYTHON_ANALYZE,
                "Python 洞察已生成",
                stepStart,
                Map.of("insightChars", insight != null ? insight.length() : 0)
        );
        return Map.of(AiAnalysisGraphKeys.PYTHON_INSIGHT, insight != null ? insight : "");
    }
}
