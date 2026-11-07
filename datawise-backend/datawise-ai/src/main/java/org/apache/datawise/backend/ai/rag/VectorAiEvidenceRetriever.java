package org.apache.datawise.backend.ai.rag;

/**
 * 向量库 evidence 检索（预留）。
 * 当 {@code datawise.ai.rag.vector-store != none} 时可替换为 PgVector / 内存实现。
 */
public interface VectorAiEvidenceRetriever {

    boolean isAvailable();

    java.util.List<org.apache.datawise.backend.ai.domain.AiEvidenceSnippet> retrieve(AiEvidenceRecallRequest request);
}
