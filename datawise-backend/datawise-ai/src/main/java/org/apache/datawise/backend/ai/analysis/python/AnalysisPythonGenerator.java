package org.apache.datawise.backend.ai.analysis.python;

import org.apache.datawise.backend.ai.support.AiLlmGateway;
import org.apache.datawise.backend.ai.support.AiPromptTemplates;
import org.apache.datawise.backend.ai.domain.AiLlmProfileDto;
import org.apache.datawise.backend.domain.ExecuteSqlResult;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;

@Component
public class AnalysisPythonGenerator {

    private final AiLlmGateway aiLlmGateway;

    public AnalysisPythonGenerator(AiLlmGateway aiLlmGateway) {
        this.aiLlmGateway = aiLlmGateway;
    }

    public String generate(
            AiLlmProfileDto llm,
            String prompt,
            ExecuteSqlResult sqlResult,
            String failedCode,
            String errorMessage
    ) {
        if (aiLlmGateway.isMock(llm)) {
            return mockPython(prompt);
        }
        String systemPrompt = AiPromptTemplates.renderPythonAnalysisSystemPrompt();
        String userPrompt = AiPromptTemplates.renderPythonAnalysisUserPrompt(
                prompt,
                sqlResult,
                failedCode,
                errorMessage
        );
        return aiLlmGateway.complete(llm, systemPrompt, userPrompt, "analysis-python");
    }

    private static String mockPython(String prompt) {
        return """
                # DataWise mock Python analysis
                import json
                print("Mock analysis for:", %s)
                """.formatted(jsonString(prompt));
    }

    private static String jsonString(String value) {
        if (value == null) {
            return "''";
        }
        return "'" + value.replace("'", "\\'") + "'";
    }
}
