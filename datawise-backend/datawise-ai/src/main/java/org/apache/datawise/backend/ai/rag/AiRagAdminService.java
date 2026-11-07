package org.apache.datawise.backend.ai.rag;

import org.apache.datawise.backend.ai.config.AiRagProperties;
import org.apache.datawise.backend.ai.domain.EffectiveAiRagConfig;
import org.apache.datawise.backend.ai.domain.AiRagRebuildResultDto;
import org.apache.datawise.backend.ai.domain.AiRagStatusDto;
import org.apache.datawise.backend.ai.rag.embedding.AiEmbeddingService;
import org.apache.datawise.backend.ai.rag.index.AiKnowledgeIndexRebuildCoordinator;
import org.apache.datawise.backend.ai.rag.index.AiKnowledgeIndexRebuildCoordinator.RebuildDecision;
import org.springframework.stereotype.Service;

@Service
public class AiRagAdminService {

    private final AiRagConfigResolver ragConfigResolver;
    private final AiKnowledgeIndexService knowledgeIndexService;
    private final AiKnowledgeIndexRebuildCoordinator rebuildCoordinator;
    private final DelegatingVectorAiEvidenceRetriever vectorRetriever;
    private final AiEmbeddingService embeddingService;

    public AiRagAdminService(
            AiRagConfigResolver ragConfigResolver,
            AiKnowledgeIndexService knowledgeIndexService,
            AiKnowledgeIndexRebuildCoordinator rebuildCoordinator,
            DelegatingVectorAiEvidenceRetriever vectorRetriever,
            AiEmbeddingService embeddingService
    ) {
        this.ragConfigResolver = ragConfigResolver;
        this.knowledgeIndexService = knowledgeIndexService;
        this.rebuildCoordinator = rebuildCoordinator;
        this.vectorRetriever = vectorRetriever;
        this.embeddingService = embeddingService;
    }

    public AiRagStatusDto status(String connectionId, String database) {
        EffectiveAiRagConfig config = ragConfigResolver.resolveForCurrentUser();
        int entryCount = knowledgeIndexService.countKnowledgeEntries(connectionId, database);
        String store = config.vectorStore() != null ? config.vectorStore().trim() : "none";
        boolean enabled = config.isVectorStoreEnabled();
        boolean available = vectorRetriever.isAvailable();
        boolean pgConfigured = knowledgeIndexService.isPgVectorConfigured();
        String embeddingProvider = embeddingService.provider();
        boolean embeddingConfigured = "hash".equalsIgnoreCase(embeddingProvider)
                || "openai".equalsIgnoreCase(embeddingProvider);
        String message = buildMessage(store, enabled, available, pgConfigured, embeddingProvider, embeddingConfigured);
        return new AiRagStatusDto(
                store,
                enabled,
                available,
                pgConfigured,
                entryCount,
                message,
                embeddingProvider,
                embeddingConfigured,
                embeddingService.dimensions(),
                ragConfigResolver.serverVectorStore(),
                config.userOverridden()
        );
    }

    public AiRagRebuildResultDto rebuild(String connectionId, String database) {
        RebuildDecision decision = rebuildCoordinator.schedule(connectionId, database);
        return AiRagRebuildResultDto.of(decision.status(), decision.syncedEntries(), decision.message());
    }

    private String buildMessage(
            String store,
            boolean enabled,
            boolean available,
            boolean pgConfigured,
            String embeddingProvider,
            boolean embeddingConfigured
    ) {
        if (!enabled || "none".equalsIgnoreCase(store)) {
            return "Vector store disabled; using keyword + schema comment retrieval (embedding="
                    + embeddingProvider + ")";
        }
        if ("memory".equalsIgnoreCase(store)) {
            if (!available) {
                return "Memory vector retriever unavailable";
            }
            return "openai".equalsIgnoreCase(embeddingProvider)
                    ? "In-memory cosine retrieval with OpenAI embeddings"
                    : "In-memory token-overlap retrieval (hash embedding)";
        }
        if ("pgvector".equalsIgnoreCase(store)) {
            if (!pgConfigured) {
                return "pgvector selected but JDBC URL is not configured";
            }
            if (!embeddingConfigured) {
                return "pgvector configured but embedding provider is not ready";
            }
            return available
                    ? "pgvector retriever active (embedding=" + embeddingProvider + ")"
                    : "pgvector configured but retriever unavailable";
        }
        return "Unknown vector store: " + store;
    }
}
