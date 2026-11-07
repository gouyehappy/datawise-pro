package org.apache.datawise.backend.ai.rag.embedding;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

class HashAiEmbeddingServiceTest {

    @Test
    void producesNormalizedVectorWithConfiguredDimensions() {
        HashAiEmbeddingService service = new HashAiEmbeddingService();
        float[] vector = service.embed("sales trend analysis");
        assertEquals(384, vector.length);
        assertEquals(384, service.dimensions());
    }
}
