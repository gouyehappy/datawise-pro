package org.apache.datawise.backend.ai.support;

import org.apache.datawise.backend.ai.config.AiDeliveryProperties;

/**
 * Wire protocol for Hybrid AI (PRODUCT_EXTENSION_PACKS Wave 2 / Wave 27).
 * <p>
 * When a hybrid gateway is configured, the local node must not ship full Prompt
 * template text on the OpenAI-compatible wire. The gateway expands {@code promptRef}
 * server-side; packet capture only sees this compact envelope + the user turn.
 */
public final class AiHybridPromptProtocol {

    public static final String PROTOCOL = "dw-ai/1";

    private AiHybridPromptProtocol() {
    }

    /**
     * Hybrid + opaque: replace rendered system templates with a promptRef envelope.
     * Offline / hybrid-without-gateway: keep full system prompt (dev compatibility).
     */
    public static String resolveWireSystemPrompt(
            AiDeliveryProperties deliveryProperties,
            String phase,
            String systemPrompt
    ) {
        if (deliveryProperties != null && deliveryProperties.shouldUseOpaquePrompts()) {
            return systemEnvelope(phase);
        }
        return systemPrompt;
    }

    /** Compact system message — no template body. */
    public static String systemEnvelope(String phase) {
        String ref = promptRefFor(phase);
        String safePhase = escapeJson(phase != null && !phase.isBlank() ? phase.trim() : "llm");
        return "{\"dw\":\"" + PROTOCOL + "\",\"promptRef\":\"" + escapeJson(ref)
                + "\",\"phase\":\"" + safePhase + "\"}";
    }

    public static String promptRefFor(String phase) {
        if (phase == null || phase.isBlank()) {
            return "llm.default";
        }
        return switch (phase.trim()) {
            case "chat" -> "chat.system";
            case "sql-generate" -> "sql.generate.system";
            case "analysis-summary" -> "analysis.summary.system";
            case "analysis-python" -> "analysis.python.system";
            case "federated-sql-generate" -> "federated.sql.generate.system";
            case "sql-review-rewrite" -> "sql.review.rewrite.system";
            case "llm" -> "llm.default";
            default -> "phase." + phase.trim().replace('/', '.').replace(' ', '.');
        };
    }

    public static boolean isOpaqueSystemEnvelope(String systemPrompt) {
        return systemPrompt != null
                && systemPrompt.contains("\"dw\":\"" + PROTOCOL + "\"")
                && systemPrompt.contains("\"promptRef\":");
    }

    private static String escapeJson(String raw) {
        if (raw == null || raw.isEmpty()) {
            return "";
        }
        StringBuilder sb = new StringBuilder(raw.length() + 8);
        for (int i = 0; i < raw.length(); i++) {
            char c = raw.charAt(i);
            switch (c) {
                case '\\' -> sb.append("\\\\");
                case '"' -> sb.append("\\\"");
                case '\n' -> sb.append("\\n");
                case '\r' -> sb.append("\\r");
                case '\t' -> sb.append("\\t");
                default -> {
                    if (c < 0x20) {
                        sb.append(String.format("\\u%04x", (int) c));
                    } else {
                        sb.append(c);
                    }
                }
            }
        }
        return sb.toString();
    }
}
