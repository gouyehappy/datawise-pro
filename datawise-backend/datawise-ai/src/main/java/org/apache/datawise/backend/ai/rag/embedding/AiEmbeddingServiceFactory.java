package org.apache.datawise.backend.ai.rag.embedding;

import org.apache.datawise.backend.ai.config.AiRagProperties;
import org.apache.datawise.backend.ai.domain.AiEmbeddingProfileDto;
import org.apache.datawise.backend.ai.support.AiLlmCallPolicy;
import org.apache.datawise.backend.ai.support.AiLlmUrlNormalizer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.ai.document.MetadataMode;
import org.springframework.ai.openai.OpenAiEmbeddingModel;
import org.springframework.ai.openai.OpenAiEmbeddingOptions;
import org.springframework.ai.openai.api.OpenAiApi;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.time.Duration;

@Component
public class AiEmbeddingServiceFactory {

    private static final Logger log = LoggerFactory.getLogger(AiEmbeddingServiceFactory.class);

    public AiEmbeddingService createServerDefault(AiRagProperties ragProperties, AiLlmCallPolicy callPolicy) {
        AiRagProperties.Embedding config = ragProperties.getEmbedding();
        if (config.isOpenAiConfigured()) {
            return createOpenAiService(config, "/v1/embeddings", callPolicy);
        }
        if (config.isOpenAiProvider()) {
            throw new IllegalStateException(
                    "datawise.ai.rag.embedding.provider=openai requires api-key and model"
            );
        }
        log.info("AI embedding provider=hash dimensions=384 (server default)");
        return new HashAiEmbeddingService();
    }

    public AiEmbeddingService createFromProfile(AiEmbeddingProfileDto profile, AiLlmCallPolicy callPolicy) {
        if (profile == null || profile.isHashProvider()) {
            return new HashAiEmbeddingService();
        }
        if (!profile.isOpenAiConfigured()) {
            throw new IllegalArgumentException("OpenAI-compatible embedding requires API key and model");
        }
        return createOpenAiService(toEmbeddingConfig(profile), profile.resolvedEmbeddingsPath(), callPolicy);
    }

    public AiEmbeddingService createFromProfileOrHash(AiEmbeddingProfileDto profile, AiLlmCallPolicy callPolicy) {
        if (profile == null || profile.isHashProvider()) {
            return new HashAiEmbeddingService();
        }
        if (!profile.isOpenAiConfigured()) {
            return new HashAiEmbeddingService();
        }
        return createOpenAiService(toEmbeddingConfig(profile), profile.resolvedEmbeddingsPath(), callPolicy);
    }

    static AiRagProperties.Embedding toEmbeddingConfig(AiEmbeddingProfileDto profile) {
        AiRagProperties.Embedding config = new AiRagProperties().getEmbedding();
        config.setProvider(profile.provider());
        config.setBaseUrl(profile.baseUrl());
        config.setApiKey(profile.apiKey());
        config.setModel(profile.model());
        config.setDimensions(profile.dimensions());
        return config;
    }

    OpenAiAiEmbeddingService createOpenAiService(
            AiRagProperties.Embedding config,
            String embeddingsPath,
            AiLlmCallPolicy callPolicy
    ) {
        int dimensions = config.resolvedDimensions();
        String baseUrl = AiLlmUrlNormalizer.normalizeBaseUrl(config.getBaseUrl());
        if (baseUrl.isBlank()) {
            baseUrl = "https://api.openai.com";
        }

        int timeoutSeconds = callPolicy.timeoutSeconds();
        SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
        requestFactory.setConnectTimeout(Duration.ofSeconds(timeoutSeconds));
        requestFactory.setReadTimeout(Duration.ofSeconds(timeoutSeconds));

        OpenAiApi openAiApi = OpenAiApi.builder()
                .baseUrl(baseUrl)
                .apiKey(config.getApiKey())
                .embeddingsPath(embeddingsPath)
                .restClientBuilder(RestClient.builder().requestFactory(requestFactory))
                .build();

        OpenAiEmbeddingOptions.Builder optionsBuilder = OpenAiEmbeddingOptions.builder()
                .model(config.getModel());
        if (config.getDimensions() != null && config.getDimensions() > 0) {
            optionsBuilder.dimensions(config.getDimensions());
        }

        OpenAiEmbeddingModel embeddingModel = new OpenAiEmbeddingModel(
                openAiApi,
                MetadataMode.EMBED,
                optionsBuilder.build()
        );
        log.debug(
                "AI embedding provider=openai model={} dimensions={} baseUrl={}",
                config.getModel(),
                dimensions,
                baseUrl
        );
        return new OpenAiAiEmbeddingService(embeddingModel, callPolicy, config);
    }
}
