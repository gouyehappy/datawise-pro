package org.apache.datawise.backend.ai.support;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.ai.chat.messages.AssistantMessage;
import org.springframework.ai.chat.model.ChatResponse;
import org.springframework.ai.chat.model.Generation;

import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * Pulls usable assistant text from OpenAI-compatible responses, including reasoning models
 * that put the answer in {@code reasoning_content} / {@code <think>} instead of {@code content}.
 * Spring AI 1.0 drops unknown fields such as {@code reasoning_content}, so raw JSON is required.
 */
public final class AiChatCompletionTextExtractor {

    private static final Logger log = LoggerFactory.getLogger(AiChatCompletionTextExtractor.class);
    private static final ObjectMapper MAPPER = new ObjectMapper();
    /** Hard cap so a long chain-of-thought cannot become the "answer". */
    private static final int MAX_REASONING_FALLBACK_CHARS = 8_192;
    private static final Pattern THINK_BLOCK = Pattern.compile(
            "(?is)<think\\b[^>]*>.*?</think>|<thinking\\b[^>]*>.*?</thinking>"
    );
    private static final Pattern ANSWER_LIKE = Pattern.compile(
            "(?is)(?:^|\\n)\\s*(?:```|SELECT\\b|WITH\\b|INSERT\\b|UPDATE\\b|DELETE\\b|CREATE\\b|"
                    + "DROP\\b|EXPLAIN\\b|SHOW\\b|import\\s+\\w+|def\\s+\\w+|print\\s*\\(|\\{|\\[)"
    );
    private static final List<String> REASONING_MESSAGE_FIELDS = List.of(
            "reasoning_content",
            "reasoningContent",
            "reasoning",
            "thinking"
    );
    private static final List<String> REASONING_METADATA_KEYS = List.of(
            "reasoningContent",
            "reasoning_content",
            "reasoning",
            "thinking"
    );

    private AiChatCompletionTextExtractor() {
    }

    public static Extracted extract(ChatResponse response, String rawJson) {
        String content = firstNonBlank(contentFromResponse(response), contentFromJson(rawJson));
        String reasoning = firstNonBlank(reasoningFromResponse(response), reasoningFromJson(rawJson));
        String refusal = firstNonBlank(refusalFromJson(rawJson));
        String contentVisible = visibleAnswer(content);
        String reasoningFallback = reasoningFallbackCandidate(reasoning);
        String chosen = firstNonBlank(contentVisible, reasoningFallback);
        boolean usedReasoning = hasText(chosen) && !hasText(contentVisible) && hasText(reasoningFallback);
        if (usedReasoning) {
            log.warn(
                    "Using reasoning-content fallback as assistant answer (chars={}); prefer models that fill content",
                    chosen.length()
            );
        }
        return new Extracted(
                chosen == null ? "" : chosen.trim(),
                usedReasoning,
                refusal == null ? "" : refusal.trim()
        );
    }

    /**
     * Only promote reasoning text when it looks like a concrete answer (SQL/code/JSON),
     * stays under {@link #MAX_REASONING_FALLBACK_CHARS}, and is not a bare chain-of-thought.
     */
    static String reasoningFallbackCandidate(String reasoning) {
        if (!hasText(reasoning)) {
            return "";
        }
        String visible = visibleAnswer(reasoning);
        if (!hasText(visible)) {
            return "";
        }
        if (visible.length() > MAX_REASONING_FALLBACK_CHARS) {
            return "";
        }
        if (!looksLikeAnswer(visible)) {
            return "";
        }
        return visible;
    }

    static boolean looksLikeAnswer(String text) {
        if (!hasText(text)) {
            return false;
        }
        String trimmed = text.trim();
        // Short structured snippets are usually the final answer, not CoT prose.
        if (trimmed.length() <= 256 && !looksLikePureProse(trimmed)) {
            return true;
        }
        return ANSWER_LIKE.matcher(trimmed).find();
    }

    private static boolean looksLikePureProse(String text) {
        String lower = text.toLowerCase(Locale.ROOT);
        return !ANSWER_LIKE.matcher(text).find()
                && (lower.contains("i should")
                || lower.contains("i need")
                || lower.contains("let me")
                || lower.contains("thinking")
                || lower.contains("step by step"));
    }

    public record Extracted(String text, boolean usedReasoningFallback, String refusal) {
        public boolean hasText() {
            return text != null && !text.isBlank();
        }

        public boolean hasRefusal() {
            return refusal != null && !refusal.isBlank();
        }
    }

    static String visibleAnswer(String text) {
        if (!hasText(text)) {
            return "";
        }
        String stripped = THINK_BLOCK.matcher(text).replaceAll("").trim();
        return stripped;
    }

    private static String contentFromResponse(ChatResponse response) {
        AssistantMessage output = outputOf(response);
        if (output == null) {
            return "";
        }
        return nullToEmpty(output.getText());
    }

    private static String reasoningFromResponse(ChatResponse response) {
        AssistantMessage output = outputOf(response);
        if (output == null) {
            return "";
        }
        Map<String, Object> metadata = output.getMetadata();
        if (metadata == null || metadata.isEmpty()) {
            return "";
        }
        for (String key : REASONING_METADATA_KEYS) {
            Object value = metadata.get(key);
            if (value != null && hasText(String.valueOf(value))) {
                return String.valueOf(value);
            }
        }
        return "";
    }

    private static AssistantMessage outputOf(ChatResponse response) {
        if (response == null) {
            return null;
        }
        Generation result = response.getResult();
        if (result == null) {
            return null;
        }
        return result.getOutput();
    }

    private static String contentFromJson(String rawJson) {
        JsonNode message = firstMessage(rawJson);
        if (message == null) {
            return "";
        }
        return firstNonBlank(
                fromContentNode(message.get("content")),
                textOrEmpty(message.path("output_text")),
                fromContentNode(firstChoice(rawJson).path("text"))
        );
    }

    private static String reasoningFromJson(String rawJson) {
        JsonNode message = firstMessage(rawJson);
        if (message == null) {
            return fromContentNodeThinkingOnly(rawJson);
        }
        String fromFields = "";
        for (String field : REASONING_MESSAGE_FIELDS) {
            fromFields = firstNonBlank(fromFields, textOrEmpty(message.get(field)));
        }
        return firstNonBlank(fromFields, thinkingPartsFromContent(message.get("content")));
    }

    private static String refusalFromJson(String rawJson) {
        JsonNode message = firstMessage(rawJson);
        if (message == null) {
            return "";
        }
        return textOrEmpty(message.get("refusal"));
    }

    private static String fromContentNodeThinkingOnly(String rawJson) {
        JsonNode message = firstMessage(rawJson);
        if (message == null) {
            return "";
        }
        return thinkingPartsFromContent(message.get("content"));
    }

    private static JsonNode firstMessage(String rawJson) {
        JsonNode choice = firstChoice(rawJson);
        if (choice == null || choice.isMissingNode() || choice.isNull()) {
            return null;
        }
        JsonNode message = choice.get("message");
        if (message != null && message.isObject()) {
            return message;
        }
        JsonNode delta = choice.get("delta");
        if (delta != null && delta.isObject()) {
            return delta;
        }
        return null;
    }

    private static JsonNode firstChoice(String rawJson) {
        JsonNode root = parse(rawJson);
        if (root == null) {
            return MAPPER.missingNode();
        }
        JsonNode choices = root.get("choices");
        if (choices != null && choices.isArray() && !choices.isEmpty()) {
            return choices.get(0);
        }
        return MAPPER.missingNode();
    }

    private static JsonNode parse(String rawJson) {
        if (rawJson == null || rawJson.isBlank()) {
            return null;
        }
        try {
            return MAPPER.readTree(rawJson);
        } catch (Exception ignored) {
            return null;
        }
    }

    private static String fromContentNode(JsonNode node) {
        if (node == null || node.isNull() || node.isMissingNode()) {
            return "";
        }
        if (node.isTextual() || node.isNumber() || node.isBoolean()) {
            return node.asText("");
        }
        if (node.isArray()) {
            StringBuilder visible = new StringBuilder();
            for (JsonNode part : node) {
                if (part.isTextual()) {
                    visible.append(part.asText());
                    continue;
                }
                if (!part.isObject() || isThinkingType(textOrEmpty(part.get("type")))) {
                    continue;
                }
                String piece = partText(part);
                if (hasText(piece)) {
                    visible.append(piece);
                }
            }
            return visible.toString();
        }
        if (node.isObject()) {
            return firstNonBlank(
                    textOrEmpty(node.get("text")),
                    textOrEmpty(node.get("output_text")),
                    fromContentNode(node.get("content"))
            );
        }
        return "";
    }

    private static String thinkingPartsFromContent(JsonNode node) {
        if (node == null || !node.isArray()) {
            return "";
        }
        StringBuilder hidden = new StringBuilder();
        for (JsonNode part : node) {
            if (!part.isObject() || !isThinkingType(textOrEmpty(part.get("type")))) {
                continue;
            }
            String piece = partText(part);
            if (hasText(piece)) {
                hidden.append(piece);
            }
        }
        return hidden.toString();
    }

    private static String partText(JsonNode part) {
        return firstNonBlank(
                textOrEmpty(part.get("text")),
                textOrEmpty(part.get("output_text")),
                textOrEmpty(part.get("content")),
                textOrEmpty(part.get("thinking")),
                textOrEmpty(part.get("reasoning")),
                textOrEmpty(part.get("reasoning_content"))
        );
    }

    private static boolean isThinkingType(String type) {
        if (type == null || type.isBlank()) {
            return false;
        }
        String normalized = type.toLowerCase(Locale.ROOT);
        return "thinking".equals(normalized)
                || "thought".equals(normalized)
                || "reasoning".equals(normalized)
                || "reasoning_content".equals(normalized);
    }

    private static String textOrEmpty(JsonNode node) {
        if (node == null || node.isNull() || node.isMissingNode()) {
            return "";
        }
        if (node.isTextual() || node.isNumber() || node.isBoolean()) {
            return node.asText("");
        }
        return "";
    }

    private static String firstNonBlank(String... values) {
        if (values == null) {
            return "";
        }
        for (String value : values) {
            if (hasText(value)) {
                return value;
            }
        }
        return "";
    }

    private static boolean hasText(String value) {
        return value != null && !value.isBlank();
    }

    private static String nullToEmpty(String value) {
        return value == null ? "" : value;
    }
}
