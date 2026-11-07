package org.apache.datawise.backend.ai.analysis.graph.nodes;

import com.alibaba.cloud.ai.graph.OverAllState;
import org.apache.datawise.backend.ai.analysis.AiAnalysisSteps;
import org.apache.datawise.backend.ai.analysis.graph.state.AiAnalysisGraphKeys;
import org.apache.datawise.backend.ai.analysis.graph.state.AiAnalysisGraphStateCoercion;
import org.apache.datawise.backend.ai.analysis.graph.support.AnalysisStepGate;
import org.apache.datawise.backend.ai.analysis.graph.support.AnalysisStepRunner;
import org.apache.datawise.backend.ai.support.AiAnalysisLlmResolver;
import org.apache.datawise.backend.ai.analysis.python.AnalysisPythonGenerator;
import org.apache.datawise.backend.ai.domain.AiChatRequest;
import org.apache.datawise.backend.domain.ExecuteSqlResult;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.Map;

@Component
public class PythonGenerateAnalysisNode {

    private final AnalysisPythonGenerator pythonGenerator;
    private final AnalysisStepGate stepGate;

    public PythonGenerateAnalysisNode(AnalysisPythonGenerator pythonGenerator, AnalysisStepGate stepGate) {
        this.pythonGenerator = pythonGenerator;
        this.stepGate = stepGate;
    }

    public Map<String, Object> execute(OverAllState state) {
        var skipped = stepGate.skipUnlessEnabled(
                AiAnalysisSteps.PYTHON_GENERATE,
                state,
                Map.of(
                        AiAnalysisGraphKeys.PYTHON_CODE, "",
                        AiAnalysisGraphKeys.PYTHON_OK, true,
                        AiAnalysisGraphKeys.PYTHON_ERROR, ""
                )
        );
        if (skipped.isPresent()) {
            return skipped.get();
        }
        AiChatRequest request = AiAnalysisGraphStateCoercion.requireRequest(state);
        String prompt = state.value(AiAnalysisGraphKeys.PROMPT, "");
        ExecuteSqlResult sqlResult = AiAnalysisGraphStateCoercion.requireExecuteResult(state);
        int retryCount = state.value(AiAnalysisGraphKeys.PYTHON_RETRY_COUNT, 0);
        String failedCode = state.value(AiAnalysisGraphKeys.PYTHON_CODE, "");
        String errorMessage = state.value(AiAnalysisGraphKeys.PYTHON_ERROR, "");
        boolean retry = retryCount > 0;

        long stepStart = AnalysisStepRunner.start();
        AnalysisStepRunner.running(
                AiAnalysisSteps.PYTHON_GENERATE,
                retry ? "修正 Python 代码" : "生成 Python 分析代码"
        );
        try {
            String code = pythonGenerator.generate(
                    AiAnalysisLlmResolver.resolve(request, AiAnalysisLlmResolver.ROUTE_PYTHON),
                    prompt,
                    sqlResult,
                    retry ? failedCode : null,
                    retry ? errorMessage : null
            );
            Map<String, Object> detail = new LinkedHashMap<>();
            detail.put("codeChars", code != null ? code.length() : 0);
            detail.put("retry", retry);
            AnalysisStepRunner.ok(
                    AiAnalysisSteps.PYTHON_GENERATE,
                    retry ? "Python 代码已修正" : "Python 代码已生成",
                    stepStart,
                    detail
            );
            Map<String, Object> updates = new LinkedHashMap<>();
            updates.put(AiAnalysisGraphKeys.PYTHON_CODE, code);
            updates.put(AiAnalysisGraphKeys.PYTHON_OK, false);
            updates.put(AiAnalysisGraphKeys.PYTHON_ERROR, "");
            return updates;
        } catch (RuntimeException ex) {
            AnalysisStepRunner.failed(AiAnalysisSteps.PYTHON_GENERATE, ex);
            throw new IllegalStateException("Python 代码生成失败: " + AnalysisStepRunner.messageOf(ex), ex);
        }
    }
}
