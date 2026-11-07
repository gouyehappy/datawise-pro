package org.apache.datawise.backend.ai.rag;

/**
 * 关键词 / 词条类 evidence 检索（非向量）
 */
public interface KeywordAiEvidenceRetriever {

    java.util.List<org.apache.datawise.backend.ai.domain.AiEvidenceSnippet> retrieve(AiEvidenceRecallRequest request);
}
