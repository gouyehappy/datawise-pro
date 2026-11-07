package org.apache.datawise.backend.ai.rag.embedding;

import org.apache.datawise.backend.ai.domain.AiEmbeddingProfileDto;
import org.apache.datawise.backend.ai.domain.AiLlmProfileDto;
import org.apache.datawise.backend.ai.support.UserAiPreferencesSupport;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class UserAiEmbeddingResolverTest {

    @Test
    void parseEmbedding_readsOpenAiProfile() {
        AiEmbeddingProfileDto profile = UserAiPreferencesSupport.parseEmbedding(Map.of(
                "provider", "openai",
                "baseUrl", "https://qianfan.baidubce.com/v2",
                "apiKey", "sk-test",
                "model", "tao-8k",
                "embeddingsPath", "/embeddings",
                "useChatConnection", false
        ));

        assertTrue(profile.isOpenAiConfigured());
        assertEquals("/embeddings", profile.resolvedEmbeddingsPath());
    }

    @Test
    void mergeEmbeddingConnection_reusesDefaultChatCredentials() {
        Map<String, Object> appConfig = Map.of(
                "ai", Map.of(
                        "defaultLlmId", "llm-1",
                        "llmProfiles", List.of(Map.of(
                                "id", "llm-1",
                                "provider", "openai",
                                "baseUrl", "https://qianfan.baidubce.com/v2",
                                "apiKey", "sk-chat",
                                "model", "qwen3-14b",
                                "completionsPath", "/chat/completions"
                        )),
                        "embedding", Map.of(
                                "provider", "openai",
                                "model", "tao-8k",
                                "embeddingsPath", "/embeddings",
                                "useChatConnection", true
                        )
                )
        );

        AiEmbeddingProfileDto merged = UserAiEmbeddingSupport.parse(appConfig);
        assertEquals("https://qianfan.baidubce.com/v2", merged.baseUrl());
        assertEquals("sk-chat", merged.apiKey());
        assertEquals("tao-8k", merged.model());
    }

    /** test helper mirroring resolver merge */
    private static final class UserAiEmbeddingSupport {
        static AiEmbeddingProfileDto parse(Map<String, Object> appConfig) {
            @SuppressWarnings("unchecked")
            Map<String, Object> ai = (Map<String, Object>) appConfig.get("ai");
            @SuppressWarnings("unchecked")
            Map<String, Object> embedding = (Map<String, Object>) ai.get("embedding");
            AiEmbeddingProfileDto profile = UserAiPreferencesSupport.parseEmbedding(embedding);
            return UserAiPreferencesSupport.mergeEmbeddingConnection(
                    profile,
                    UserAiPreferencesSupport.readDefaultChatProfile(appConfig)
            );
        }
    }
}
