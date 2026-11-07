package org.apache.datawise.backend.ai.rag.embedding;

import org.apache.datawise.backend.ai.config.AiRagProperties;
import org.apache.datawise.backend.ai.support.AiLlmCallPolicy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.ai.embedding.EmbeddingModel;

/**
 * OpenAI 兼容 embedding API（Spring AI {@link EmbeddingModel}）。
 */
public class OpenAiAiEmbeddingService implements AiEmbeddingService {

    private static final Logger log = LoggerFactory.getLogger(OpenAiAiEmbeddingService.class);

    private final EmbeddingModel embeddingModel;
    private final AiLlmCallPolicy callPolicy;
    private final int dimensions;
    private final String model;

    public OpenAiAiEmbeddingService(
            EmbeddingModel embeddingModel,
            AiLlmCallPolicy callPolicy,
            AiRagProperties.Embedding config
    ) {
        this.embeddingModel = embeddingModel;
        this.callPolicy = callPolicy;
        this.dimensions = config.resolvedDimensions();
        this.model = config.getModel();
    }

    @Override
    public String provider() {
        return "openai";
    }

    @Override
    public int dimensions() {
        return dimensions;
    }

    @Override
    public float[] embed(String text) {
        if (text == null || text.isBlank()) {
            return new float[dimensions];
        }
        return callPolicy.executeForResult("embedding", () -> {
            long started = System.currentTimeMillis();
            float[] vector = embeddingModel.embed(text);
            if (vector == null || vector.length == 0) {
                throw new IllegalArgumentException("Embedding API returned empty vector for model " + model);
            }
            if (vector.length != dimensions) {
                throw new IllegalStateException(
                        "Embedding dimension mismatch: expected " + dimensions + " but got " + vector.length
                                + " for model " + model
                );
            }
            log.debug("Embedded {} chars in {}ms (model={})", text.length(), System.currentTimeMillis() - started, model);
            return vector;
        });
    }
}
