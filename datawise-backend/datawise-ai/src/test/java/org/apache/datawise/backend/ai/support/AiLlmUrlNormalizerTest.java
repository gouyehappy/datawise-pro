package org.apache.datawise.backend.ai.support;

import org.apache.datawise.backend.ai.support.AiLlmUrlNormalizer;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

class AiLlmUrlNormalizerTest {

    @Test
    void stripsTrailingV1Segment() {
        assertEquals("https://api.openai.com", AiLlmUrlNormalizer.normalizeBaseUrl("https://api.openai.com/v1"));
        assertEquals("https://api.openai.com", AiLlmUrlNormalizer.normalizeBaseUrl("https://api.openai.com/v1/"));
    }

    @Test
    void keepsBaseWithoutVersionSuffix() {
        assertEquals("https://api.openai.com", AiLlmUrlNormalizer.normalizeBaseUrl("https://api.openai.com"));
        assertEquals("https://api.deepseek.com", AiLlmUrlNormalizer.normalizeBaseUrl("https://api.deepseek.com"));
    }

    @Test
    void stripsFullChatCompletionsPath() {
        assertEquals(
                "https://api.openai.com",
                AiLlmUrlNormalizer.normalizeBaseUrl("https://api.openai.com/v1/chat/completions")
        );
    }

    @Test
    void keepsGatewayPathsThatDoNotEndWithV1() {
        assertEquals(
                "https://gateway.ai.cloudflare.com/v1/account/gateway/openai",
                AiLlmUrlNormalizer.normalizeBaseUrl("https://gateway.ai.cloudflare.com/v1/account/gateway/openai")
        );
    }

    @Test
    void stripsCompatibleModeV1Suffix() {
        assertEquals(
                "https://dashscope.aliyuncs.com/compatible-mode",
                AiLlmUrlNormalizer.normalizeBaseUrl("https://dashscope.aliyuncs.com/compatible-mode/v1")
        );
    }
}
