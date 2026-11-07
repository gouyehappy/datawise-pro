package org.apache.datawise.backend.ai.support;

/**
 * Normalizes OpenAI-compatible base URLs for Spring AI.
 * {@link org.springframework.ai.openai.api.OpenAiApi} appends {@code /v1/chat/completions}
 * to the base URL, so user input must not already include {@code /v1} or the full path.
 */
public final class AiLlmUrlNormalizer {

    private static final String CHAT_COMPLETIONS_SUFFIX = "/chat/completions";
    private static final String V1_SUFFIX = "/v1";

    private AiLlmUrlNormalizer() {
    }

    public static String normalizeBaseUrl(String baseUrl) {
        if (baseUrl == null) {
            return "";
        }

        String trimmed = baseUrl.trim();
        if (trimmed.isEmpty()) {
            return trimmed;
        }

        trimmed = stripTrailingSlashes(trimmed);

        if (trimmed.endsWith(CHAT_COMPLETIONS_SUFFIX)) {
            trimmed = stripTrailingSlashes(
                    trimmed.substring(0, trimmed.length() - CHAT_COMPLETIONS_SUFFIX.length())
            );
        }

        if (trimmed.endsWith(V1_SUFFIX)) {
            trimmed = stripTrailingSlashes(trimmed.substring(0, trimmed.length() - V1_SUFFIX.length()));
        }

        return trimmed;
    }

    private static String stripTrailingSlashes(String value) {
        return value.replaceAll("/+$", "");
    }
}
