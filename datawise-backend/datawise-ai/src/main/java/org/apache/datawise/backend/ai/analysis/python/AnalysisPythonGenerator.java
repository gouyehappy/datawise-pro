package org.apache.datawise.backend.ai.analysis.python;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.datawise.backend.ai.support.AiLlmGateway;
import org.apache.datawise.backend.ai.support.AiPromptTemplates;
import org.apache.datawise.backend.ai.domain.AiLlmProfileDto;
import org.apache.datawise.backend.domain.ExecuteSqlResult;
import org.springframework.stereotype.Component;

@Component
public class AnalysisPythonGenerator {

    private static final ObjectMapper JSON = new ObjectMapper();

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

    /** Jackson JSON string literal — valid in Python and escapes backslash/newline/quotes. */
    private static String jsonString(String value) {
        try {
            return JSON.writeValueAsString(value == null ? "" : value);
        } catch (JsonProcessingException ex) {
            return "\"\"";
        }
    }
}
