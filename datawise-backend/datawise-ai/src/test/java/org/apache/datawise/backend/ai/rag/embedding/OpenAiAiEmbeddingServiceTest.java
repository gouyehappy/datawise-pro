package org.apache.datawise.backend.ai.rag.embedding;

import org.apache.datawise.backend.ai.config.AiRagProperties;
import org.apache.datawise.backend.ai.support.AiLlmCallPolicy;
import org.junit.jupiter.api.Test;
import org.springframework.ai.embedding.EmbeddingModel;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class OpenAiAiEmbeddingServiceTest {

    @Test
    void embedDelegatesToModel() {
        EmbeddingModel model = mock(EmbeddingModel.class);
        float[] expected = {0.1F, 0.2F, 0.3F};
        when(model.embed(anyString())).thenReturn(expected);

        AiRagProperties.Embedding config = new AiRagProperties().getEmbedding();
        config.setProvider("openai");
        config.setApiKey("sk-test");
        config.setModel("text-embedding-3-small");
        config.setDimensions(3);

        AiLlmCallPolicy callPolicy = mock(AiLlmCallPolicy.class);
        when(callPolicy.executeForResult(org.mockito.ArgumentMatchers.eq("embedding"), org.mockito.ArgumentMatchers.any()))
                .thenAnswer(invocation -> ((java.util.function.Supplier<?>) invocation.getArgument(1)).get());

        OpenAiAiEmbeddingService service = new OpenAiAiEmbeddingService(model, callPolicy, config);
        assertEquals("openai", service.provider());
        assertEquals(3, service.dimensions());
        assertArrayEquals(expected, service.embed("hello"));
    }

    @Test
    void blankTextReturnsZeroVector() {
        AiRagProperties.Embedding config = new AiRagProperties().getEmbedding();
        config.setDimensions(4);

        OpenAiAiEmbeddingService service = new OpenAiAiEmbeddingService(
                mock(EmbeddingModel.class),
                mock(AiLlmCallPolicy.class),
                config
        );
        assertArrayEquals(new float[4], service.embed("  "));
    }
}
