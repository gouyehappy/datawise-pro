package org.apache.datawise.backend.ai.domain;

public record AiLlmProfileDto(
        String provider,
        String baseUrl,
        String apiKey,
        String model,
        Double temperature,
        Integer maxTokens,
        String completionsPath
) {
    public String resolvedCompletionsPath() {
        if (completionsPath != null && !completionsPath.isBlank()) {
            String trimmed = completionsPath.trim();
            return trimmed.startsWith("/") ? trimmed : "/" + trimmed;
        }
        return "/v1/chat/completions";
    }
}
