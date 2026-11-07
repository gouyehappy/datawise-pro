package org.apache.datawise.backend.ai.domain;

/**
 * 用户 app 配置中的 embedding 模型（RAG 向量索引）。
 */
public record AiEmbeddingProfileDto(
        String provider,
        String baseUrl,
        String apiKey,
        String model,
        Integer dimensions,
        String embeddingsPath,
        Boolean useChatConnection
) {
    public boolean isHashProvider() {
        return provider == null || provider.isBlank() || "hash".equalsIgnoreCase(provider.trim());
    }

    public boolean isOpenAiProvider() {
        return provider != null && "openai".equalsIgnoreCase(provider.trim());
    }

    public boolean usesChatConnection() {
        return Boolean.TRUE.equals(useChatConnection);
    }

    public boolean isOpenAiConfigured() {
        return isOpenAiProvider()
                && apiKey != null && !apiKey.isBlank()
                && model != null && !model.isBlank()
                && baseUrl != null && !baseUrl.isBlank();
    }

    public String resolvedEmbeddingsPath() {
        if (embeddingsPath != null && !embeddingsPath.isBlank()) {
            String trimmed = embeddingsPath.trim();
            return trimmed.startsWith("/") ? trimmed : "/" + trimmed;
        }
        return "/v1/embeddings";
    }
}
