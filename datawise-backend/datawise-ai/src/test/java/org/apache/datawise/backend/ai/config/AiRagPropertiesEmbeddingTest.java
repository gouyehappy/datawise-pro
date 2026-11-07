package org.apache.datawise.backend.ai.config;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class AiRagPropertiesEmbeddingTest {

    @Test
    void hashProviderIsDefault() {
        AiRagProperties.Embedding embedding = new AiRagProperties().getEmbedding();
        assertEquals("hash", embedding.getProvider());
        assertFalse(embedding.isOpenAiConfigured());
    }

    @Test
    void openAiRequiresApiKeyAndModel() {
        AiRagProperties.Embedding embedding = new AiRagProperties().getEmbedding();
        embedding.setProvider("openai");
        embedding.setModel("");
        assertFalse(embedding.isOpenAiConfigured());

        embedding.setApiKey("sk-test");
        assertFalse(embedding.isOpenAiConfigured());

        embedding.setModel("text-embedding-3-small");
        assertTrue(embedding.isOpenAiConfigured());
    }

    @Test
    void resolvedDimensionsUsesModelDefaults() {
        AiRagProperties.Embedding embedding = new AiRagProperties().getEmbedding();
        embedding.setModel("text-embedding-3-small");
        assertEquals(1536, embedding.resolvedDimensions());

        embedding.setModel("text-embedding-3-large");
        assertEquals(3072, embedding.resolvedDimensions());

        embedding.setDimensions(512);
        assertEquals(512, embedding.resolvedDimensions());
    }
}
