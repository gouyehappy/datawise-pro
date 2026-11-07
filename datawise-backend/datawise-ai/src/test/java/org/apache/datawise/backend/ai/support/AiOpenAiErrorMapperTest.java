package org.apache.datawise.backend.ai.support;

import org.apache.datawise.backend.ai.domain.AiLlmProfileDto;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertTrue;

class AiOpenAiErrorMapperTest {

    @Test
    void toEmbeddingMessage_explainsQianfanModelMismatch() {
        String message = AiOpenAiErrorMapper.toEmbeddingMessage(
                "https://qianfan.baidubce.com/v2",
                "/embeddings",
                "qwen3-14b",
                "404 - {\"error\":{\"code\":\"no_such_model\",\"message\":\"API name not exist\"}}"
        );

        assertTrue(message.contains("qwen3-14b"));
        assertTrue(message.contains("tao-8k"));
        assertTrue(message.contains("/embeddings"));
    }

    @Test
    void toChatMessage_explainsModelNotFound() {
        String message = AiOpenAiErrorMapper.toChatMessage(
                new AiLlmProfileDto(
                        "openai",
                        "https://qianfan.baidubce.com/v2",
                        "sk-test",
                        "text-embedding-3-small",
                        0.7,
                        4096,
                        "/chat/completions"
                ),
                "404 - no_such_model API name not exist"
        );

        assertTrue(message.contains("Chat"));
        assertTrue(message.contains("text-embedding-3-small"));
    }
}
