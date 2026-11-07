package org.apache.datawise.backend.ai.analysis.python;

import org.apache.datawise.backend.ai.support.AiLlmGateway;
import org.apache.datawise.backend.ai.support.AiPromptTemplates;
import org.apache.datawise.backend.ai.domain.AiLlmProfileDto;
import org.springframework.stereotype.Component;

@Component
public class AnalysisPythonAnalyzer {

    private final AiLlmGateway aiLlmGateway;

    public AnalysisPythonAnalyzer(AiLlmGateway aiLlmGateway) {
        this.aiLlmGateway = aiLlmGateway;
    }

    public String analyze(AiLlmProfileDto llm, String prompt, String pythonStdout) {
        if (pythonStdout == null || pythonStdout.isBlank()) {
            return "";
        }
        if (aiLlmGateway.isMock(llm)) {
            return pythonStdout.trim();
        }
        return aiLlmGateway.complete(
                llm,
                AiPromptTemplates.renderPythonAnalyzeSystemPrompt(),
                AiPromptTemplates.renderPythonAnalyzeUserPrompt(prompt, pythonStdout),
                "analysis-python-analyze"
        );
    }
}
