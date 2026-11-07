package org.apache.datawise.backend.ai.support;

import org.apache.datawise.backend.ai.domain.AiLlmProfileDto;

/**
 * Maps Spring AI / OpenAI-compatible provider errors to actionable configuration hints.
 */
public final class AiOpenAiErrorMapper {

    private AiOpenAiErrorMapper() {
    }

    public static String toChatMessage(AiLlmProfileDto profile, String rawMessage) {
        return toMessage(
                "Chat",
                profile.baseUrl(),
                profile.resolvedCompletionsPath(),
                profile.model(),
                rawMessage,
                "Use a chat model id (e.g. qwen3-14b on Qianfan), not an embedding model."
        );
    }

    public static String toEmbeddingMessage(
            String baseUrl,
            String embeddingsPath,
            String model,
            String rawMessage
    ) {
        return toMessage(
                "Embedding",
                baseUrl,
                embeddingsPath,
                model,
                rawMessage,
                "Use an embedding model id (e.g. tao-8k, embedding-v1, bge-large-zh on Qianfan), not a chat model."
        );
    }

    private static String toMessage(
            String kind,
            String baseUrl,
            String path,
            String model,
            String rawMessage,
            String modelHint
    ) {
        String message = rawMessage == null ? "" : rawMessage;
        if (message.contains("no_such_model") || message.contains("API name not exist")) {
            StringBuilder sb = new StringBuilder();
            sb.append(kind).append(" model not found: \"").append(safe(model)).append("\". ");
            sb.append(modelHint);
            if (looksLikeQianfan(baseUrl)) {
                sb.append(" Qianfan example: base https://qianfan.baidubce.com/v2, path ")
                        .append(qianfanPathHint(kind))
                        .append(", embedding model tao-8k or embedding-v1.");
            }
            sb.append(" Ensure the model is enabled in your provider console.");
            return sb.toString();
        }
        if (message.contains("404")) {
            return kind + " API returned 404. Check base URL and path. Configured base: "
                    + safe(baseUrl) + ", path: " + safe(path) + ".";
        }
        return kind + " request failed: " + message;
    }

    private static boolean looksLikeQianfan(String baseUrl) {
        return baseUrl != null && baseUrl.toLowerCase().contains("qianfan");
    }

    private static String qianfanPathHint(String kind) {
        return "Chat".equals(kind) ? "/chat/completions" : "/embeddings";
    }

    private static String safe(String value) {
        return value == null || value.isBlank() ? "(empty)" : value.trim();
    }
}
