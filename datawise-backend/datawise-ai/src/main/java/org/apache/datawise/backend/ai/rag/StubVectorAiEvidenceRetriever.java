package org.apache.datawise.backend.ai.rag;

import org.apache.datawise.backend.ai.domain.EffectiveAiRagConfig;
import org.apache.datawise.backend.ai.domain.AiEvidenceSnippet;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Locale;

/**
 * 向量库检索预留实现。
 * 配置 {@code datawise.ai.rag.vector-store=pgvector|memory} 后替换本 Bean 即可接入混合检索。
 */
@Component
public class StubVectorAiEvidenceRetriever implements VectorAiEvidenceRetriever {

    private static final Logger log = LoggerFactory.getLogger(StubVectorAiEvidenceRetriever.class);

    private final AiRagConfigResolver ragConfigResolver;

    public StubVectorAiEvidenceRetriever(AiRagConfigResolver ragConfigResolver) {
        this.ragConfigResolver = ragConfigResolver;
    }

    @Override
    public boolean isAvailable() {
        EffectiveAiRagConfig config = ragConfigResolver.resolveForCurrentUser();
        if (!config.isVectorStoreEnabled()) {
            return false;
        }
        String store = config.vectorStore().trim().toLowerCase(Locale.ROOT);
        return !"memory".equals(store) && !"pgvector".equals(store);
    }

    @Override
    public List<AiEvidenceSnippet> retrieve(AiEvidenceRecallRequest request) {
        if (!isAvailable()) {
            return List.of();
        }
        EffectiveAiRagConfig config = ragConfigResolver.resolveForCurrentUser();
        log.info(
                "AI RAG vector store type={} is configured but not implemented yet; falling back to keyword-only",
                config.vectorStore()
        );
        return List.of();
    }
}
