package org.apache.datawise.backend.ai.rag.embedding;

/**
 * 文本 embedding（pgvector / 内存向量检索共用）
 */
public interface AiEmbeddingService {

    /** hash | openai */
    default String provider() {
        return "hash";
    }

    int dimensions();

    float[] embed(String text);
}
