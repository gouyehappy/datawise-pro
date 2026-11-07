package org.apache.datawise.backend.ai.domain;

import org.apache.datawise.backend.ai.config.AiRagProperties;

/**
 * 当前请求生效的 RAG 向量库配置（用户 app 配置覆盖服务端 application.yml 默认值）。
 */
public record EffectiveAiRagConfig(
        boolean ragEnabled,
        String vectorStore,
        PgVector pgvector,
        boolean userOverridden
) {
    public boolean isVectorStoreEnabled() {
        return vectorStore != null
                && !vectorStore.isBlank()
                && !"none".equalsIgnoreCase(vectorStore.trim());
    }

    public record PgVector(String jdbcUrl, String username, String password, String table) {
        public boolean isConfigured() {
            return jdbcUrl != null && !jdbcUrl.isBlank();
        }

        public String resolvedTable() {
            return table != null && !table.isBlank() ? table : "ai_evidence_embeddings";
        }
    }

    public static PgVector fromServer(AiRagProperties.PgVector pg) {
        return new PgVector(pg.getJdbcUrl(), pg.getUsername(), pg.getPassword(), pg.getTable());
    }

    public AiRagProperties.PgVector toLegacyPgVector() {
        AiRagProperties.PgVector pg = new AiRagProperties().getPgvector();
        pg.setJdbcUrl(pgvector.jdbcUrl() != null ? pgvector.jdbcUrl() : "");
        pg.setUsername(pgvector.username() != null ? pgvector.username() : "");
        pg.setPassword(pgvector.password() != null ? pgvector.password() : "");
        pg.setTable(pgvector.resolvedTable());
        return pg;
    }
}
