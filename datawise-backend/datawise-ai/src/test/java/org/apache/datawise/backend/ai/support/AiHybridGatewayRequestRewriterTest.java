package org.apache.datawise.backend.ai.support;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class AiHybridGatewayRequestRewriterTest {

    @Test
    void expandsOpaqueSystemBeforeUpstream() {
        String envelope = AiHybridPromptProtocol.systemEnvelope("chat");
        Map<String, Object> body = Map.of(
                "model", "demo",
                "messages", List.of(
                        Map.of("role", "system", "content", envelope),
                        Map.of("role", "user", "content", "hello")
                )
        );

        AiHybridGatewayRequestRewriter.RewriteResult result = AiHybridGatewayRequestRewriter.rewrite(body);
        assertTrue(result.opaqueExpanded());
        assertEquals("chat.system", result.promptRef());

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> messages = (List<Map<String, Object>>) result.body().get("messages");
        String system = String.valueOf(messages.get(0).get("content"));
        assertFalse(AiHybridPromptProtocol.isOpaqueSystemEnvelope(system));
        assertTrue(system.contains("database assistant"));
        assertEquals("hello", messages.get(1).get("content"));
    }

    @Test
    void leavesPlainSystemUntouched() {
        Map<String, Object> body = Map.of(
                "messages", List.of(Map.of("role", "system", "content", "plain"))
        );
        AiHybridGatewayRequestRewriter.RewriteResult result = AiHybridGatewayRequestRewriter.rewrite(body);
        assertFalse(result.opaqueExpanded());
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> messages = (List<Map<String, Object>>) result.body().get("messages");
        assertEquals("plain", messages.get(0).get("content"));
    }

    @Test
    void normalizeUpstreamBaseKeepsV1() {
        assertEquals(
                "https://api.openai.com/v1",
                AiHybridGatewayUpstreamClient.normalizeUpstreamBase("https://api.openai.com/v1/")
        );
        assertEquals(
                "https://api.openai.com/v1",
                AiHybridGatewayUpstreamClient.normalizeUpstreamBase("https://api.openai.com/v1/chat/completions")
        );
    }
}
