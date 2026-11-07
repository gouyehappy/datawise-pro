package org.apache.datawise.backend.ai.support;

import org.apache.datawise.backend.ai.domain.AiLlmProfileDto;
import org.springframework.ai.openai.OpenAiChatOptions;

import java.util.Locale;

/**
 * Request options that work for both chat models and reasoning models (o1/o3, DeepSeek-R1, QwQ).
 * Callers should try {@link #standardOptions} first, then retry with {@link #reasoningOptions}
 * only when the provider rejects {@code max_tokens} / {@code temperature}.
 */
public final class AiOpenAiReasoningSupport {

    private static final int DEFAULT_MAX_TOKENS = 4096;

    private AiOpenAiReasoningSupport() {
    }

    public static OpenAiChatOptions standardOptions(AiLlmProfileDto profile) {
        return OpenAiChatOptions.builder()
                .model(profile.model())
                .temperature(profile.temperature() != null ? profile.temperature() : 0.7)
                .maxTokens(maxTokensOf(profile))
                .build();
    }

    public static OpenAiChatOptions reasoningOptions(AiLlmProfileDto profile) {
        return OpenAiChatOptions.builder()
                .model(profile.model())
                .maxCompletionTokens(maxTokensOf(profile))
                .build();
    }

    public static boolean looksLikeReasoningParamRejected(Throwable ex) {
        String message = collectMessages(ex).toLowerCase(Locale.ROOT);
        if (message.isBlank()) {
            return false;
        }
        boolean unsupported = message.contains("unsupported")
                || message.contains("not support")
                || message.contains("invalid_request")
                || message.contains("unknown parameter")
                || message.contains("unexpected parameter")
                || message.contains("invalid parameter");
        boolean param = message.contains("max_tokens")
                || message.contains("max tokens")
                || message.contains("temperature");
        return unsupported && param;
    }

    private static int maxTokensOf(AiLlmProfileDto profile) {
        return profile.maxTokens() != null ? profile.maxTokens() : DEFAULT_MAX_TOKENS;
    }

    private static String collectMessages(Throwable ex) {
        StringBuilder all = new StringBuilder();
        for (Throwable current = ex; current != null; current = current.getCause()) {
            if (current.getMessage() != null) {
                all.append(' ').append(current.getMessage());
            }
        }
        return all.toString();
    }
}
