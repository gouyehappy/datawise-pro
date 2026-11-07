package org.apache.datawise.backend.ai.support;

import org.apache.datawise.backend.ai.support.prompt.AiAnalysisPromptTemplates;
import org.apache.datawise.backend.ai.support.prompt.AiChatPromptTemplates;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Expands Hybrid {@code dw-ai/1} opaque system envelopes into Prompt template text.
 * Used by private / cloud gateways and the local {@code gateway-stub} (Wave 28).
 */
public final class AiHybridPromptExpander {

    private static final Pattern PROMPT_REF = Pattern.compile("\"promptRef\"\\s*:\\s*\"([^\"]+)\"");

    private AiHybridPromptExpander() {
    }

    /** Expand when opaque; otherwise return the original system message. */
    public static String expandSystem(String systemOrEnvelope) {
        if (!AiHybridPromptProtocol.isOpaqueSystemEnvelope(systemOrEnvelope)) {
            return systemOrEnvelope;
        }
        String ref = extractPromptRef(systemOrEnvelope);
        return expandPromptRef(ref != null ? ref : "llm.default");
    }

    public static String extractPromptRef(String envelope) {
        if (envelope == null || envelope.isBlank()) {
            return null;
        }
        Matcher matcher = PROMPT_REF.matcher(envelope);
        if (!matcher.find()) {
            return null;
        }
        return matcher.group(1);
    }

    public static String expandPromptRef(String promptRef) {
        if (promptRef == null || promptRef.isBlank()) {
            return AiChatPromptTemplates.renderSystemPrompt(null);
        }
        return switch (promptRef.trim()) {
            case "chat.system" -> AiChatPromptTemplates.renderSystemPrompt(null);
            case "sql.generate.system" -> String.join("\n",
                    "You are a SQL generator for DataWise.",
                    "Prefer safe read-only queries unless the user asks otherwise.",
                    "Always return executable SELECT/WITH SQL.",
                    "Comments alone are invalid; optional -- AI: summary must be followed by real SQL."
            );
            case "analysis.summary.system" -> AiAnalysisPromptTemplates.renderSummarySystemPrompt();
            case "analysis.python.system" -> AiAnalysisPromptTemplates.renderPythonAnalysisSystemPrompt();
            case "federated.sql.generate.system" -> String.join("\n",
                    "You generate federated SQL for DataWise.",
                    "Respect source dialects and avoid cross-engine unsafe constructs."
            );
            case "sql.review.rewrite.system" -> String.join("\n",
                    "You rewrite SQL for DataWise review.",
                    "Preserve intent; prefer clearer, safer statements."
            );
            case "llm.default" -> AiChatPromptTemplates.renderSystemPrompt(null);
            default -> "DataWise hybrid gateway expanded promptRef=" + promptRef.trim();
        };
    }
}
