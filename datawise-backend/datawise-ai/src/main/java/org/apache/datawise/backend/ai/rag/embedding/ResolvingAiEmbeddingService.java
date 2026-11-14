package org.apache.datawise.backend.ai.rag.embedding;

import org.apache.datawise.backend.ai.domain.AiEmbeddingProfileDto;
import org.apache.datawise.backend.ai.support.AiLlmCallPolicy;
import org.apache.datawise.backend.security.UserContext;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 按当前用户 app 配置解析 embedding 实现；无用户配置时回退服务端 application.yml。
 */
public class ResolvingAiEmbeddingService implements AiEmbeddingService {

    private final AiEmbeddingService serverDefault;
    private final UserAiEmbeddingResolver userResolver;
    private final AiEmbeddingServiceFactory factory;
    private final AiLlmCallPolicy callPolicy;
    private final Map<String, AiEmbeddingService> cache = new ConcurrentHashMap<>();

    public ResolvingAiEmbeddingService(
            AiEmbeddingService serverDefault,
            UserAiEmbeddingResolver userResolver,
            AiEmbeddingServiceFactory factory,
            AiLlmCallPolicy callPolicy
    ) {
        this.serverDefault = serverDefault;
        this.userResolver = userResolver;
        this.factory = factory;
        this.callPolicy = callPolicy;
    }

    @Override
    public String provider() {
        return delegate().provider();
    }

    @Override
    public int dimensions() {
        return delegate().dimensions();
    }

    @Override
    public float[] embed(String text) {
        return delegate().embed(text);
    }

    @Override
    public List<float[]> embedAll(List<String> texts) {
        return delegate().embedAll(texts);
    }

    private AiEmbeddingService delegate() {
        Optional<AiEmbeddingProfileDto> userProfile = userResolver.resolveForCurrentUser();
        if (userProfile.isEmpty()) {
            return serverDefault;
        }
        AiEmbeddingProfileDto profile = userProfile.get();
        Long userId = UserContext.getUserId();
        String userKey = userId != null ? String.valueOf(userId) : "anon";
        String apiKeyFingerprint = fingerprintSecret(profile.apiKey());
        if (profile.isHashProvider()) {
            return cached("hash:" + userKey, () -> factory.createFromProfileOrHash(profile, callPolicy));
        }
        if (profile.isOpenAiConfigured()) {
            String cacheKey = "openai:"
                    + userKey
                    + ":"
                    + profile.baseUrl()
                    + ":"
                    + profile.model()
                    + ":"
                    + profile.dimensions()
                    + ":"
                    + apiKeyFingerprint;
            return cached(cacheKey, () -> factory.createFromProfile(profile, callPolicy));
        }
        return serverDefault;
    }

    private AiEmbeddingService cached(String key, java.util.function.Supplier<AiEmbeddingService> supplier) {
        return cache.computeIfAbsent(key, ignored -> supplier.get());
    }

    private static String fingerprintSecret(String secret) {
        if (secret == null || secret.isBlank()) {
            return "none";
        }
        // Length + first/last nibble — enough to separate credentials without storing the key.
        return secret.length() + ":" + Integer.toHexString(secret.hashCode());
    }
}
