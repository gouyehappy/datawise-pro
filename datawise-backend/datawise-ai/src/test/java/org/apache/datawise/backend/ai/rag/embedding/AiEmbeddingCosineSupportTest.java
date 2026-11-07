package org.apache.datawise.backend.ai.rag.embedding;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

class AiEmbeddingCosineSupportTest {

    @Test
    void identicalVectorsScoreOne() {
        float[] vector = {1F, 0F, 0F};
        assertEquals(1D, AiEmbeddingCosineSupport.cosineSimilarity(vector, vector), 1e-6);
    }

    @Test
    void orthogonalVectorsScoreZero() {
        assertEquals(0D, AiEmbeddingCosineSupport.cosineSimilarity(new float[] {1F, 0F}, new float[] {0F, 1F}), 1e-6);
    }

    @Test
    void rejectsMismatchedLengths() {
        assertEquals(0D, AiEmbeddingCosineSupport.cosineSimilarity(new float[] {1F}, new float[] {1F, 0F}), 1e-6);
    }
}
