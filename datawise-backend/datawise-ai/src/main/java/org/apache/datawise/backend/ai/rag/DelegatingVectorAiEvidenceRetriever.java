package org.apache.datawise.backend.ai.rag;

import jakarta.annotation.PostConstruct;
import org.apache.datawise.backend.ai.config.AiRagProperties;
import org.apache.datawise.backend.ai.domain.AiEvidenceSnippet;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Primary;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Locale;
import java.util.Set;

/**
 * 按配置路由 memory / pgvector / stub 向量检索实现
 */
@Primary
@Component
public class DelegatingVectorAiEvidenceRetriever implements VectorAiEvidenceRetriever {

    private static final Logger log = LoggerFactory.getLogger(DelegatingVectorAiEvidenceRetriever.class);
    private static final Set<String> SUPPORTED_VECTOR_STORES = Set.of("none", "memory", "pgvector");

    private final AiRagProperties ragProperties;
    private final MemoryVectorAiEvidenceRetriever memoryRetriever;
    private final PgVectorAiEvidenceRetriever pgVectorRetriever;
    private final StubVectorAiEvidenceRetriever stubRetriever;

    public DelegatingVectorAiEvidenceRetriever(
            AiRagProperties ragProperties,
            MemoryVectorAiEvidenceRetriever memoryRetriever,
            PgVectorAiEvidenceRetriever pgVectorRetriever,
            StubVectorAiEvidenceRetriever stubRetriever
    ) {
        this.ragProperties = ragProperties;
        this.memoryRetriever = memoryRetriever;
        this.pgVectorRetriever = pgVectorRetriever;
        this.stubRetriever = stubRetriever;
    }

    @PostConstruct
    void validateVectorStoreConfig() {
        String vectorStore = ragProperties.getVectorStore();
        if (vectorStore == null || vectorStore.isBlank()) {
            return;
        }
        String normalized = vectorStore.trim().toLowerCase(Locale.ROOT);
        if (!SUPPORTED_VECTOR_STORES.contains(normalized)) {
            log.warn(
                    "Unsupported datawise.ai.rag.vector-store value '{}'; supported values: none, memory, pgvector",
                    vectorStore
            );
        }
    }

    @Override
    public boolean isAvailable() {
        return delegate().isAvailable();
    }

    @Override
    public List<AiEvidenceSnippet> retrieve(AiEvidenceRecallRequest request) {
        return delegate().retrieve(request);
    }

    private VectorAiEvidenceRetriever delegate() {
        if (pgVectorRetriever.isAvailable()) {
            return pgVectorRetriever;
        }
        if (memoryRetriever.isAvailable()) {
            return memoryRetriever;
        }
        return stubRetriever;
    }
}
