package org.apache.datawise.backend.domain;

import java.util.Locale;
import java.util.Set;

/**
 * AI call metering capability ids (PRODUCT_EXTENSION_PACKS — Wave 29).
 * Daily hard cap still applies to the sum; breakdown is recorded per capability.
 */
public final class AiMeterCapabilities {

    public static final String CHAT = "ai.chat";
    public static final String SQL_GENERATE = "ai.sql.generate";
    public static final String ANALYZE = "ai.analyze";
    /** Semantic layer AI auto-generate (Wave 33). */
    public static final String SEMANTIC_AUTO = "ai.semantic.auto";
    /** Federated view SQL generation (Wave 33). */
    public static final String FEDERATED_SQL = "ai.federated.sql";
    /** Analysis canvas parameter expand / rerun (Wave 34). */
    public static final String CANVAS_RERUN = "ai.canvas.rerun";
    public static final String OTHER = "ai.other";

    public static final Set<String> KNOWN = Set.of(
            CHAT, SQL_GENERATE, ANALYZE, SEMANTIC_AUTO, FEDERATED_SQL, CANVAS_RERUN, OTHER);

    private AiMeterCapabilities() {
    }

    public static String normalize(String capability) {
        if (capability == null || capability.isBlank()) {
            return OTHER;
        }
        String raw = capability.trim().toLowerCase(Locale.ROOT);
        return switch (raw) {
            case "chat", "ai.chat" -> CHAT;
            case "sql.generate", "ai.sql.generate", "sql-generate", "sql_generate" -> SQL_GENERATE;
            case "analyze", "ai.analyze", "analysis" -> ANALYZE;
            case "semantic.auto", "ai.semantic.auto", "semantic-auto" -> SEMANTIC_AUTO;
            case "federated.sql", "ai.federated.sql", "federated-sql" -> FEDERATED_SQL;
            case "canvas.rerun", "ai.canvas.rerun", "canvas-rerun" -> CANVAS_RERUN;
            default -> raw.startsWith("ai.") ? raw : "ai." + raw;
        };
    }
}
