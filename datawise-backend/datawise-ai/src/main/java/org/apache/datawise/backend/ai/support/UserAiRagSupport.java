package org.apache.datawise.backend.ai.support;

import org.apache.datawise.backend.ai.domain.EffectiveAiRagConfig;

import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

/** 从 app.xml ai.rag 节解析用户 RAG 向量库配置。 */
public final class UserAiRagSupport {

    private static final Set<String> SUPPORTED_VECTOR_STORES = Set.of("none", "memory", "pgvector");

    private UserAiRagSupport() {
    }

    @SuppressWarnings("unchecked")
    public static Optional<UserAiRagPreferences> readUserRagPreferences(Map<String, Object> appConfig) {
        if (appConfig == null) {
            return Optional.empty();
        }
        Object aiRaw = appConfig.get("ai");
        if (!(aiRaw instanceof Map<?, ?> ai)) {
            return Optional.empty();
        }
        Object ragRaw = ai.get("rag");
        if (!(ragRaw instanceof Map<?, ?> rag)) {
            return Optional.empty();
        }
        String vectorStore = stringValue(rag.get("vectorStore"));
        EffectiveAiRagConfig.PgVector pgvector = parsePgVector((Map<String, Object>) rag.get("pgvector"));
        boolean hasVectorStore = !vectorStore.isBlank();
        boolean hasPgvector = pgvector != null
                && (!pgvector.jdbcUrl().isBlank()
                || !pgvector.username().isBlank()
                || !pgvector.password().isBlank()
                || !pgvector.table().isBlank());
        if (!hasVectorStore && !hasPgvector) {
            return Optional.empty();
        }
        return Optional.of(new UserAiRagPreferences(
                hasVectorStore ? normalizeVectorStore(vectorStore) : null,
                pgvector
        ));
    }

    @SuppressWarnings("unchecked")
    private static EffectiveAiRagConfig.PgVector parsePgVector(Map<String, Object> raw) {
        if (raw == null || raw.isEmpty()) {
            return null;
        }
        return new EffectiveAiRagConfig.PgVector(
                stringValue(raw.get("jdbcUrl")),
                stringValue(raw.get("username")),
                stringValue(raw.get("password")),
                stringValue(raw.get("table"))
        );
    }

    public static String normalizeVectorStore(String raw) {
        if (raw == null || raw.isBlank()) {
            return "";
        }
        String normalized = raw.trim().toLowerCase(Locale.ROOT);
        if (!SUPPORTED_VECTOR_STORES.contains(normalized)) {
            return normalized;
        }
        return normalized;
    }

    private static String stringValue(Object raw) {
        return raw instanceof String value ? value.trim() : "";
    }

    public record UserAiRagPreferences(
            String vectorStore,
            EffectiveAiRagConfig.PgVector pgvector
    ) {
    }
}
