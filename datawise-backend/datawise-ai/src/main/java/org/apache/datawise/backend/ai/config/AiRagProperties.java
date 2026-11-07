package org.apache.datawise.backend.ai.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * RAG 配置。当前默认关键词 + schema 注释；向量库通过 {@code vectorStore} 预留。
 */
@ConfigurationProperties(prefix = "datawise.ai.rag")
public class AiRagProperties {

    /**
     * 是否启用 evidence 召回节点
     */
    private boolean enabled = true;

    /**
     * 向量库类型（预留）：none | memory | pgvector
     * none 时使用 {@link org.apache.datawise.backend.ai.rag.VectorAiEvidenceRetriever} 空实现。
     */
    private String vectorStore = "none";

    private int maxSnippets = 12;

    private int maxGlossaryHits = 6;

    private final PgVector pgvector = new PgVector();
    private final Index index = new Index();
    private final Embedding embedding = new Embedding();

    public Embedding getEmbedding() {
        return embedding;
    }

    public PgVector getPgvector() {
        return pgvector;
    }

    public Index getIndex() {
        return index;
    }

    public static class Embedding {
        /**
         * hash — 本地确定性向量（开发/离线）；openai — OpenAI 兼容 embedding API。
         */
        private String provider = "hash";
        private String baseUrl = "";
        private String apiKey = "";
        private String model = "text-embedding-3-small";
        /**
         * 可选；未设置时按 model 推断（text-embedding-3-small → 1536）。
         */
        private Integer dimensions;

        public String getProvider() {
            return provider;
        }

        public void setProvider(String provider) {
            this.provider = provider;
        }

        public String getBaseUrl() {
            return baseUrl;
        }

        public void setBaseUrl(String baseUrl) {
            this.baseUrl = baseUrl;
        }

        public String getApiKey() {
            return apiKey;
        }

        public void setApiKey(String apiKey) {
            this.apiKey = apiKey;
        }

        public String getModel() {
            return model;
        }

        public void setModel(String model) {
            this.model = model;
        }

        public Integer getDimensions() {
            return dimensions;
        }

        public void setDimensions(Integer dimensions) {
            this.dimensions = dimensions;
        }

        public boolean isOpenAiProvider() {
            return provider != null && "openai".equalsIgnoreCase(provider.trim());
        }

        public boolean isOpenAiConfigured() {
            return isOpenAiProvider()
                    && apiKey != null && !apiKey.isBlank()
                    && model != null && !model.isBlank();
        }

        public int resolvedDimensions() {
            if (dimensions != null && dimensions > 0) {
                return dimensions;
            }
            String normalized = model != null ? model.trim().toLowerCase() : "";
            return switch (normalized) {
                case "text-embedding-3-large" -> 3072;
                case "text-embedding-ada-002", "text-embedding-3-small" -> 1536;
                default -> 1536;
            };
        }
    }

    public static class Index {
        private boolean asyncRebuild = true;
        private int maxConcurrentRebuilds = 1;
        private int minRebuildIntervalSeconds = 60;

        public boolean isAsyncRebuild() {
            return asyncRebuild;
        }

        public void setAsyncRebuild(boolean asyncRebuild) {
            this.asyncRebuild = asyncRebuild;
        }

        public int getMaxConcurrentRebuilds() {
            return Math.max(1, maxConcurrentRebuilds);
        }

        public void setMaxConcurrentRebuilds(int maxConcurrentRebuilds) {
            this.maxConcurrentRebuilds = maxConcurrentRebuilds;
        }

        public int getMinRebuildIntervalSeconds() {
            return Math.max(0, minRebuildIntervalSeconds);
        }

        public void setMinRebuildIntervalSeconds(int minRebuildIntervalSeconds) {
            this.minRebuildIntervalSeconds = minRebuildIntervalSeconds;
        }
    }

    public static class PgVector {
        private String jdbcUrl = "";
        private String username = "";
        private String password = "";
        private String table = "ai_evidence_embeddings";

        public boolean isConfigured() {
            return jdbcUrl != null && !jdbcUrl.isBlank();
        }

        public String getJdbcUrl() {
            return jdbcUrl;
        }

        public void setJdbcUrl(String jdbcUrl) {
            this.jdbcUrl = jdbcUrl;
        }

        public String getUsername() {
            return username;
        }

        public void setUsername(String username) {
            this.username = username;
        }

        public String getPassword() {
            return password;
        }

        public void setPassword(String password) {
            this.password = password;
        }

        public String getTable() {
            return table != null && !table.isBlank() ? table : "ai_evidence_embeddings";
        }

        public void setTable(String table) {
            this.table = table;
        }
    }

    public boolean isEnabled() {
        return enabled;
    }

    public void setEnabled(boolean enabled) {
        this.enabled = enabled;
    }

    public String getVectorStore() {
        return vectorStore;
    }

    public void setVectorStore(String vectorStore) {
        this.vectorStore = vectorStore;
    }

    public boolean isVectorStoreEnabled() {
        return vectorStore != null
                && !vectorStore.isBlank()
                && !"none".equalsIgnoreCase(vectorStore.trim());
    }

    public int getMaxSnippets() {
        return maxSnippets;
    }

    public void setMaxSnippets(int maxSnippets) {
        this.maxSnippets = maxSnippets;
    }

    public int getMaxGlossaryHits() {
        return maxGlossaryHits;
    }

    public void setMaxGlossaryHits(int maxGlossaryHits) {
        this.maxGlossaryHits = maxGlossaryHits;
    }
}
