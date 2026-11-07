package org.apache.datawise.backend.ai.config;

import org.apache.datawise.backend.ai.rag.embedding.AiEmbeddingService;
import org.apache.datawise.backend.ai.rag.embedding.AiEmbeddingServiceFactory;
import org.apache.datawise.backend.ai.rag.embedding.ResolvingAiEmbeddingService;
import org.apache.datawise.backend.ai.rag.embedding.UserAiEmbeddingResolver;
import org.apache.datawise.backend.ai.support.AiLlmCallPolicy;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;

@Configuration
public class AiEmbeddingConfiguration {

    @Bean
    @Qualifier("serverAiEmbedding")
    AiEmbeddingService serverAiEmbeddingService(
            AiRagProperties ragProperties,
            AiLlmCallPolicy callPolicy,
            AiEmbeddingServiceFactory factory
    ) {
        return factory.createServerDefault(ragProperties, callPolicy);
    }

    @Bean
    @Primary
    AiEmbeddingService aiEmbeddingService(
            @Qualifier("serverAiEmbedding") AiEmbeddingService serverDefault,
            UserAiEmbeddingResolver userResolver,
            AiEmbeddingServiceFactory factory,
            AiLlmCallPolicy callPolicy
    ) {
        return new ResolvingAiEmbeddingService(serverDefault, userResolver, factory, callPolicy);
    }
}
