package org.apache.datawise.backend.ai.support;

import org.apache.datawise.backend.ai.domain.AiLlmProfileDto;
import org.junit.jupiter.api.Test;
import org.springframework.ai.openai.OpenAiChatOptions;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class AiOpenAiReasoningSupportTest {

    @Test
    void standardOptionsKeepMaxTokensAndTemperature() {
        OpenAiChatOptions options = AiOpenAiReasoningSupport.standardOptions(profile());
        assertEquals("deepseek-reasoner", options.getModel());
        assertEquals(0.7, options.getTemperature());
        assertEquals(4096, options.getMaxTokens());
        assertNull(options.getMaxCompletionTokens());
    }

    @Test
    void reasoningOptionsUseMaxCompletionTokensAndOmitTemperature() {
        OpenAiChatOptions options = AiOpenAiReasoningSupport.reasoningOptions(profile());
        assertEquals("deepseek-reasoner", options.getModel());
        assertNull(options.getTemperature());
        assertNull(options.getMaxTokens());
        assertEquals(4096, options.getMaxCompletionTokens());
    }

    @Test
    void detectsOpenAiReasoningParamRejection() {
        assertTrue(AiOpenAiReasoningSupport.looksLikeReasoningParamRejected(
                new IllegalArgumentException(
                        "Unsupported parameter: 'max_tokens' is not supported with this model. "
                                + "Use 'max_completion_tokens' instead."
                )
        ));
        assertTrue(AiOpenAiReasoningSupport.looksLikeReasoningParamRejected(
                new IllegalStateException("400", new RuntimeException("temperature is not supported with this model"))
        ));
        assertFalse(AiOpenAiReasoningSupport.looksLikeReasoningParamRejected(
                new IllegalArgumentException("LLM returned empty reply")
        ));
        assertFalse(AiOpenAiReasoningSupport.looksLikeReasoningParamRejected(
                new IllegalArgumentException("rate limit exceeded")
        ));
    }

    private static AiLlmProfileDto profile() {
        return new AiLlmProfileDto(
                "openai",
                "https://api.deepseek.com",
                "sk-test",
                "deepseek-reasoner",
                null,
                null,
                null
        );
    }
}
