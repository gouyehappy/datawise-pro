package org.apache.datawise.backend.ai.analysis.graph.nodes;

import com.alibaba.cloud.ai.graph.OverAllState;
import org.apache.datawise.backend.ai.analysis.AiAnalysisSteps;
import org.apache.datawise.backend.ai.analysis.graph.state.AiAnalysisGraphKeys;
import org.apache.datawise.backend.ai.analysis.graph.state.AiAnalysisGraphStateCoercion;
import org.apache.datawise.backend.ai.analysis.graph.support.AnalysisStepGate;
import org.apache.datawise.backend.ai.analysis.graph.support.AnalysisStepRunner;
import org.apache.datawise.backend.ai.analysis.python.PythonCodeExecutor;
import org.apache.datawise.backend.domain.ExecuteSqlResult;
import org.apache.datawise.backend.ai.domain.PythonExecutionResult;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.Map;

@Component
public class PythonExecuteAnalysisNode {

    private final PythonCodeExecutor pythonCodeExecutor;
    private final AnalysisStepGate stepGate;

    public PythonExecuteAnalysisNode(PythonCodeExecutor pythonCodeExecutor, AnalysisStepGate stepGate) {
        this.pythonCodeExecutor = pythonCodeExecutor;
        this.stepGate = stepGate;
    }

    public Map<String, Object> execute(OverAllState state) {
        var skipped = stepGate.skipUnlessEnabled(
                AiAnalysisSteps.PYTHON_EXECUTE,
                state,
                Map.of(
                        AiAnalysisGraphKeys.PYTHON_OK, true,
                        AiAnalysisGraphKeys.PYTHON_ERROR, "",
                        AiAnalysisGraphKeys.PYTHON_RESULT, ""
                )
        );
        if (skipped.isPresent()) {
            return skipped.get();
        }
        String prompt = state.value(AiAnalysisGraphKeys.PROMPT, "");
        String code = state.value(AiAnalysisGraphKeys.PYTHON_CODE, "");
        ExecuteSqlResult sqlResult = AiAnalysisGraphStateCoercion.requireExecuteResult(state);
        long stepStart = AnalysisStepRunner.start();

        AnalysisStepRunner.running(AiAnalysisSteps.PYTHON_EXECUTE, "执行 Python 分析");
        PythonExecutionResult result = pythonCodeExecutor.execute(code, sqlResult, prompt);

        if (result.ok()) {
            Map<String, Object> detail = new LinkedHashMap<>();
            detail.put("stdoutChars", result.stdout() != null ? result.stdout().length() : 0);
            AnalysisStepRunner.ok(AiAnalysisSteps.PYTHON_EXECUTE, "Python 执行完成", stepStart, detail);
            Map<String, Object> updates = new LinkedHashMap<>();
            updates.put(AiAnalysisGraphKeys.PYTHON_RESULT, result.stdout());
            updates.put(AiAnalysisGraphKeys.PYTHON_OK, true);
            updates.put(AiAnalysisGraphKeys.PYTHON_ERROR, "");
            return updates;
        }

        int retryCount = state.value(AiAnalysisGraphKeys.PYTHON_RETRY_COUNT, 0);
        AnalysisStepRunner.failed(AiAnalysisSteps.PYTHON_EXECUTE, result.errorMessage());
        Map<String, Object> updates = new LinkedHashMap<>();
        updates.put(AiAnalysisGraphKeys.PYTHON_OK, false);
        updates.put(AiAnalysisGraphKeys.PYTHON_ERROR, result.errorMessage());
        updates.put(AiAnalysisGraphKeys.PYTHON_RETRY_COUNT, retryCount + 1);
        return updates;
    }
}
