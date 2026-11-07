package org.apache.datawise.backend.ai.analysis.graph.nodes;

import com.alibaba.cloud.ai.graph.OverAllState;
import org.apache.datawise.backend.ai.analysis.AiAnalysisSteps;
import org.apache.datawise.backend.ai.analysis.graph.state.AiAnalysisGraphKeys;
import org.apache.datawise.backend.ai.analysis.graph.support.AnalysisStepRunner;
import org.apache.datawise.backend.ai.domain.AiChatReply;
import org.springframework.stereotype.Component;

import java.util.Map;

/**
 * 分析终止节点：校验失败或 SQL 执行失败时生成用户可见的错误回复。
 */
@Component
public class AnalysisFailedNode {

    public Map<String, Object> execute(OverAllState state) {
        String error = resolveErrorMessage(state);
        emitTerminalFailure(state, error);
        AiChatReply reply = AiChatReply.chat(formatFailureReply(error));
        return Map.of(AiAnalysisGraphKeys.REPLY, reply);
    }

    private static String formatFailureReply(String error) {
        if (error == null || error.isBlank()) {
            return "数据分析失败：分析流程异常终止";
        }
        String trimmed = error.trim();
        if (trimmed.startsWith("查询结果") || trimmed.startsWith("数据不足")) {
            return "数据分析失败：无法生成图表。" + trimmed;
        }
        return "数据分析失败：" + trimmed;
    }

    private void emitTerminalFailure(OverAllState state, String error) {
        String executionError = state.value(AiAnalysisGraphKeys.EXECUTION_ERROR, "");
        if (executionError != null && !executionError.isBlank()) {
            AnalysisStepRunner.failed(AiAnalysisSteps.SQL_EXECUTE, error);
            return;
        }
        String validationError = state.value(AiAnalysisGraphKeys.VALIDATION_ERROR, "");
        if (validationError != null && !validationError.isBlank()) {
            AnalysisStepRunner.failed(AiAnalysisSteps.SQL_VALIDATE, error);
            return;
        }
        String pythonError = state.value(AiAnalysisGraphKeys.PYTHON_ERROR, "");
        if (pythonError != null && !pythonError.isBlank()) {
            AnalysisStepRunner.failed(AiAnalysisSteps.PYTHON_EXECUTE, error);
            return;
        }
        String chartError = state.value(AiAnalysisGraphKeys.CHART_ERROR, "");
        if (chartError != null && !chartError.isBlank()) {
            AnalysisStepRunner.failed(AiAnalysisSteps.CHART, error);
        }
    }

    private String resolveErrorMessage(OverAllState state) {
        String chartError = state.value(AiAnalysisGraphKeys.CHART_ERROR, "");
        if (chartError != null && !chartError.isBlank()) {
            return chartError.trim();
        }
        String pythonError = state.value(AiAnalysisGraphKeys.PYTHON_ERROR, "");
        if (pythonError != null && !pythonError.isBlank()) {
            return pythonError.trim();
        }
        String executionError = state.value(AiAnalysisGraphKeys.EXECUTION_ERROR, "");
        if (executionError != null && !executionError.isBlank()) {
            return executionError.trim();
        }
        String validationError = state.value(AiAnalysisGraphKeys.VALIDATION_ERROR, "");
        if (validationError != null && !validationError.isBlank()) {
            return validationError.trim();
        }
        return "分析流程异常终止";
    }
}
