package org.apache.datawise.backend.ai.support;

import org.junit.jupiter.api.Test;
import org.springframework.ai.chat.messages.AssistantMessage;
import org.springframework.ai.chat.model.ChatResponse;
import org.springframework.ai.chat.model.Generation;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class AiChatCompletionTextExtractorTest {

    @Test
    void prefersVisibleContentOverReasoning() {
        String json = """
                {"choices":[{"message":{
                  "content":"SELECT 1",
                  "reasoning_content":"I should write a query"
                }}]}
                """;
        AiChatCompletionTextExtractor.Extracted extracted = AiChatCompletionTextExtractor.extract(null, json);
        assertEquals("SELECT 1", extracted.text());
        assertFalse(extracted.usedReasoningFallback());
    }

    @Test
    void usesReasoningContentWhenAssistantTextIsEmpty() {
        String json = """
                {"choices":[{"message":{
                  "role":"assistant",
                  "content":"",
                  "reasoning_content":"Need a read-only query.\\nSELECT id FROM orders"
                }}]}
                """;
        AiChatCompletionTextExtractor.Extracted extracted = AiChatCompletionTextExtractor.extract(null, json);
        assertEquals("Need a read-only query.\nSELECT id FROM orders", extracted.text());
        assertTrue(extracted.usedReasoningFallback());
    }

    @Test
    void stripsThinkTagsFromContent() {
        String json = """
                {"choices":[{"message":{"content":"<think>plan the query</think>\\nSELECT * FROM t"}}]}
                """;
        AiChatCompletionTextExtractor.Extracted extracted = AiChatCompletionTextExtractor.extract(null, json);
        assertEquals("SELECT * FROM t", extracted.text());
        assertFalse(extracted.usedReasoningFallback());
    }

    @Test
    void usesTextPartsFromMultimodalContentArray() {
        String json = """
                {"choices":[{"message":{"content":[
                  {"type":"reasoning","reasoning":"hidden chain"},
                  {"type":"text","text":"SELECT count(*) FROM t"}
                ]}}]}
                """;
        AiChatCompletionTextExtractor.Extracted extracted = AiChatCompletionTextExtractor.extract(null, json);
        assertEquals("SELECT count(*) FROM t", extracted.text());
        assertFalse(extracted.usedReasoningFallback());
    }

    @Test
    void fallsBackToThinkingPartsWhenContentArrayHasNoText() {
        String json = """
                {"choices":[{"message":{"content":[
                  {"type":"thinking","thinking":"SELECT name FROM users"}
                ]}}]}
                """;
        AiChatCompletionTextExtractor.Extracted extracted = AiChatCompletionTextExtractor.extract(null, json);
        assertEquals("SELECT name FROM users", extracted.text());
        assertTrue(extracted.usedReasoningFallback());
    }

    @Test
    void readsRefusal() {
        String json = """
                {"choices":[{"message":{"content":null,"refusal":"I cannot help with that"}}]}
                """;
        AiChatCompletionTextExtractor.Extracted extracted = AiChatCompletionTextExtractor.extract(null, json);
        assertTrue(extracted.hasRefusal());
        assertEquals("I cannot help with that", extracted.refusal());
        assertFalse(extracted.hasText());
    }

    @Test
    void usesSpringAiMetadataWhenJsonIsMissing() {
        AssistantMessage message = new AssistantMessage(
                "",
                Map.of("reasoningContent", "SELECT 2")
        );
        ChatResponse response = new ChatResponse(List.of(new Generation(message)));
        AiChatCompletionTextExtractor.Extracted extracted =
                AiChatCompletionTextExtractor.extract(response, null);
        assertEquals("SELECT 2", extracted.text());
        assertTrue(extracted.usedReasoningFallback());
    }

    @Test
    void emptyWhenNothingUsable() {
        AiChatCompletionTextExtractor.Extracted extracted =
                AiChatCompletionTextExtractor.extract(null, "{\"choices\":[{\"message\":{\"content\":\"\"}}]}");
        assertFalse(extracted.hasText());
        assertFalse(extracted.usedReasoningFallback());
    }
}
