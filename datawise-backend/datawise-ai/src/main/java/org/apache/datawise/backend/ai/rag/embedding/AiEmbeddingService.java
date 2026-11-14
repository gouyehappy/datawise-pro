package org.apache.datawise.backend.ai.rag.embedding;

import java.util.ArrayList;
import java.util.List;

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

    /** Batch embed; default loops {@link #embed(String)}. Providers may override for one round-trip. */
    default List<float[]> embedAll(List<String> texts) {
        if (texts == null || texts.isEmpty()) {
            return List.of();
        }
        List<float[]> out = new ArrayList<>(texts.size());
        for (String text : texts) {
            out.add(embed(text));
        }
        return out;
    }
}
