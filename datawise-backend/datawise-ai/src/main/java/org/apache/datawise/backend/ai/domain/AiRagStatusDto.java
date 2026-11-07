package org.apache.datawise.backend.ai.domain;

public record AiRagStatusDto(
        String vectorStore,
        boolean vectorStoreEnabled,
        boolean retrieverAvailable,
        boolean pgvectorConfigured,
        int knowledgeEntryCount,
        String message,
        String embeddingProvider,
        boolean embeddingConfigured,
        int embeddingDimensions,
        String serverVectorStore,
        boolean userConfigured
) {
}
