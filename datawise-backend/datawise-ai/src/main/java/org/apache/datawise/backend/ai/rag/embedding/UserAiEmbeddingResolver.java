package org.apache.datawise.backend.ai.rag.embedding;

import org.apache.datawise.backend.ai.domain.AiEmbeddingProfileDto;
import org.apache.datawise.backend.ai.domain.AiLlmProfileDto;
import org.apache.datawise.backend.ai.support.UserAiPreferencesSupport;
import org.apache.datawise.backend.configstore.UserAppConfigStore;
import org.apache.datawise.backend.security.UserContext;
import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.Optional;

/** 从当前用户 app 配置读取 embedding 模型。 */
@Component
public class UserAiEmbeddingResolver {

    private final UserAppConfigStore userAppConfigStore;

    public UserAiEmbeddingResolver(UserAppConfigStore userAppConfigStore) {
        this.userAppConfigStore = userAppConfigStore;
    }

    public Optional<AiEmbeddingProfileDto> resolveForCurrentUser() {
        Long userId = UserContext.getUserId();
        if (userId == null || UserContext.isGuest()) {
            return Optional.empty();
        }
        return userAppConfigStore.readAppConfig(userId).flatMap(this::parseEmbeddingFromAppConfig);
    }

    Optional<AiEmbeddingProfileDto> parseEmbeddingFromAppConfig(Map<String, Object> appConfig) {
        Optional<AiEmbeddingProfileDto> embedding = UserAiPreferencesSupport.readDefaultEmbeddingProfile(appConfig);
        if (embedding.isEmpty()) {
            return Optional.empty();
        }
        Optional<AiLlmProfileDto> chat = UserAiPreferencesSupport.readDefaultChatProfile(appConfig);
        return Optional.ofNullable(UserAiPreferencesSupport.mergeEmbeddingConnection(embedding.get(), chat));
    }
}
