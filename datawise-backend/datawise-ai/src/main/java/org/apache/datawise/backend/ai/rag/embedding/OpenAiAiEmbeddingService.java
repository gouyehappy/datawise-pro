package org.apache.datawise.backend.ai.rag.embedding;

import org.apache.datawise.backend.ai.config.AiRagProperties;
import org.apache.datawise.backend.ai.support.AiLlmCallPolicy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.ai.embedding.EmbeddingModel;

import java.util.ArrayList;
import java.util.List;

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
        List<float[]> batch = embedAll(List.of(text));
        if (batch == null || batch.isEmpty() || batch.get(0) == null) {
            return new float[dimensions];
        }
        return batch.get(0);
    }

    @Override
    public List<float[]> embedAll(List<String> texts) {
        if (texts == null || texts.isEmpty()) {
            return List.of();
        }
        List<String> normalized = new ArrayList<>(texts.size());
        for (String text : texts) {
            normalized.add(text == null || text.isBlank() ? "" : text);
        }
        return callPolicy.executeForResult("embedding-batch", () -> {
            long started = System.currentTimeMillis();
            List<float[]> vectors = embeddingModel.embed(normalized);
            if (vectors == null || vectors.size() != normalized.size()) {
                throw new IllegalStateException(
                        "Embedding batch size mismatch for model " + model
                                + ": expected " + normalized.size()
                                + " got " + (vectors == null ? 0 : vectors.size())
                );
            }
            List<float[]> out = new ArrayList<>(vectors.size());
            for (int i = 0; i < vectors.size(); i++) {
                float[] vector = vectors.get(i);
                if (normalized.get(i).isBlank()) {
                    out.add(new float[dimensions]);
                    continue;
                }
                if (vector == null || vector.length == 0) {
                    throw new IllegalArgumentException("Embedding API returned empty vector for model " + model);
                }
                if (vector.length != dimensions) {
                    throw new IllegalStateException(
                            "Embedding dimension mismatch: expected " + dimensions + " but got " + vector.length
                                    + " for model " + model
                    );
                }
                out.add(vector);
            }
            log.debug("Embedded batch size={} in {}ms (model={})", normalized.size(), System.currentTimeMillis() - started, model);
            return out;
        });
    }
}
