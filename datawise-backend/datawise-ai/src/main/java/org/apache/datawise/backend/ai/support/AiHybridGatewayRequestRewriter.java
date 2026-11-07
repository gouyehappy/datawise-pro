package org.apache.datawise.backend.ai.support;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Rewrites OpenAI-compatible chat payloads for Hybrid gateways:
 * expand opaque {@code dw-ai/1} system envelopes before upstream inference (Wave 30).
 */
public final class AiHybridGatewayRequestRewriter {

    private AiHybridGatewayRequestRewriter() {
    }

    /**
     * Returns a shallow-copied body with system messages expanded.
     * Also returns whether any opaque envelope was expanded.
     */
    @SuppressWarnings("unchecked")
    public static RewriteResult rewrite(Map<String, Object> body) {
        if (body == null) {
            return new RewriteResult(Map.of(), false, null);
        }
        Map<String, Object> next = new LinkedHashMap<>(body);
        Object rawMessages = body.get("messages");
        if (!(rawMessages instanceof List<?> list) || list.isEmpty()) {
            return new RewriteResult(next, false, null);
        }
        List<Map<String, Object>> rewritten = new ArrayList<>(list.size());
        boolean expanded = false;
        String promptRef = null;
        for (Object item : list) {
            if (!(item instanceof Map<?, ?> map)) {
                continue;
            }
            Map<String, Object> message = new LinkedHashMap<>((Map<String, Object>) map);
            String role = stringOf(message.get("role"));
            String content = stringOf(message.get("content"));
            if ("system".equalsIgnoreCase(role) && AiHybridPromptProtocol.isOpaqueSystemEnvelope(content)) {
                promptRef = AiHybridPromptExpander.extractPromptRef(content);
                message.put("content", AiHybridPromptExpander.expandSystem(content));
                expanded = true;
            }
            rewritten.add(message);
        }
        next.put("messages", rewritten);
        return new RewriteResult(next, expanded, promptRef);
    }

    private static String stringOf(Object value) {
        return value == null ? "" : String.valueOf(value);
    }

    public record RewriteResult(
            Map<String, Object> body,
            boolean opaqueExpanded,
            String promptRef
    ) {
    }
}
