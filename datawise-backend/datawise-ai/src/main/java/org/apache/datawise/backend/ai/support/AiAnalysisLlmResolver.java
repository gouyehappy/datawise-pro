package org.apache.datawise.backend.ai.support;

import org.apache.datawise.backend.ai.domain.AiChatRequest;
import org.apache.datawise.backend.ai.domain.AiLlmProfileDto;

import java.util.Map;

/**
 * Resolves per-route LLM profiles from {@link AiChatRequest#stepLlms()}, falling back to {@link AiChatRequest#llm()}.
 */
public final class AiAnalysisLlmResolver {

    public static final String ROUTE_PLANNING = "planning";
    public static final String ROUTE_SQL = "sql";
    public static final String ROUTE_PYTHON = "python";
    public static final String ROUTE_SUMMARY = "summary";

    private AiAnalysisLlmResolver() {
    }

    public static AiLlmProfileDto resolve(AiChatRequest request, String route) {
        if (request == null) {
            return null;
        }
        Map<String, AiLlmProfileDto> stepLlms = request.stepLlms();
        if (stepLlms != null && route != null && !route.isBlank()) {
            AiLlmProfileDto mapped = stepLlms.get(route);
            if (mapped != null) {
                return mapped;
            }
        }
        return request.llm();
    }
}
