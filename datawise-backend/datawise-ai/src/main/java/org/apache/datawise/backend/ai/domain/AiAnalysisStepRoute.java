package org.apache.datawise.backend.ai.domain;

import java.util.List;

/**
 * LLM 步骤路由节点输出：当次分析禁用的可选步骤
 */
public record AiAnalysisStepRoute(
        List<String> disabledSteps,
        String rationale
) {
    public static AiAnalysisStepRoute empty(String rationale) {
        return new AiAnalysisStepRoute(List.of(), rationale);
    }
}
