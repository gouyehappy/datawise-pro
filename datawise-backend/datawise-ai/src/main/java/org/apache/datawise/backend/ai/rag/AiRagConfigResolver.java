package org.apache.datawise.backend.ai.rag;

import org.apache.datawise.backend.ai.config.AiRagProperties;
import org.apache.datawise.backend.ai.domain.EffectiveAiRagConfig;
import org.apache.datawise.backend.ai.support.UserAiRagSupport;
import org.apache.datawise.backend.configstore.UserAppConfigStore;
import org.apache.datawise.backend.security.UserContext;
import org.springframework.stereotype.Component;

import java.util.Locale;
import java.util.Optional;

/** 合并服务端默认与用户 app 配置，得到当前请求生效的 RAG 向量库设置。 */
@Component
public class AiRagConfigResolver {

    private final AiRagProperties serverDefaults;
    private final UserAppConfigStore userAppConfigStore;

    public AiRagConfigResolver(AiRagProperties serverDefaults, UserAppConfigStore userAppConfigStore) {
        this.serverDefaults = serverDefaults;
        this.userAppConfigStore = userAppConfigStore;
    }

    public EffectiveAiRagConfig resolveForCurrentUser() {
        Optional<UserAiRagSupport.UserAiRagPreferences> userPrefs = readUserPreferences();
        return merge(userPrefs);
    }

    public String serverVectorStore() {
        return normalizeStore(serverDefaults.getVectorStore());
    }

    private Optional<UserAiRagSupport.UserAiRagPreferences> readUserPreferences() {
        Long userId = UserContext.getUserId();
        if (userId == null || UserContext.isGuest()) {
            return Optional.empty();
        }
        return userAppConfigStore.readAppConfig(userId).flatMap(UserAiRagSupport::readUserRagPreferences);
    }

    private EffectiveAiRagConfig merge(Optional<UserAiRagSupport.UserAiRagPreferences> userPrefs) {
        String serverStore = normalizeStore(serverDefaults.getVectorStore());
        if (userPrefs.isEmpty()) {
            return new EffectiveAiRagConfig(
                    serverDefaults.isEnabled(),
                    serverStore,
                    EffectiveAiRagConfig.fromServer(serverDefaults.getPgvector()),
                    false
            );
        }
        UserAiRagSupport.UserAiRagPreferences user = userPrefs.get();
        String effectiveStore = user.vectorStore() != null ? user.vectorStore() : serverStore;
        EffectiveAiRagConfig.PgVector effectivePg = mergePgVector(user.pgvector());
        return new EffectiveAiRagConfig(
                serverDefaults.isEnabled(),
                effectiveStore,
                effectivePg,
                true
        );
    }

    private EffectiveAiRagConfig.PgVector mergePgVector(EffectiveAiRagConfig.PgVector userPg) {
        EffectiveAiRagConfig.PgVector serverPg = EffectiveAiRagConfig.fromServer(serverDefaults.getPgvector());
        if (userPg == null) {
            return serverPg;
        }
        return new EffectiveAiRagConfig.PgVector(
                firstNonBlank(userPg.jdbcUrl(), serverPg.jdbcUrl()),
                firstNonBlank(userPg.username(), serverPg.username()),
                firstNonBlank(userPg.password(), serverPg.password()),
                firstNonBlank(userPg.table(), serverPg.resolvedTable())
        );
    }

    private static String firstNonBlank(String preferred, String fallback) {
        if (preferred != null && !preferred.isBlank()) {
            return preferred.trim();
        }
        return fallback != null ? fallback.trim() : "";
    }

    private static String normalizeStore(String raw) {
        if (raw == null || raw.isBlank()) {
            return "none";
        }
        return raw.trim().toLowerCase(Locale.ROOT);
    }
}
