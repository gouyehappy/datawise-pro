package org.apache.datawise.backend.ai.support;

import org.apache.datawise.backend.ai.domain.AiChatRequest;
import org.apache.datawise.backend.ai.domain.AiLlmProfileDto;
import org.apache.datawise.backend.ai.domain.AiSqlGenerateRequest;
import org.apache.datawise.backend.configstore.UserAppConfigStore;
import org.apache.datawise.backend.security.UserContext;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;

/** 从当前用户 AI 偏好 / app 配置读取默认 LLM，并在客户端脱敏后回填 apiKey。 */
@Component
public class UserAiLlmResolver {

    private final UserAppConfigStore userAppConfigStore;

    public UserAiLlmResolver(UserAppConfigStore userAppConfigStore) {
        this.userAppConfigStore = userAppConfigStore;
    }

    public Optional<AiLlmProfileDto> resolveForCurrentUser() {
        Long userId = UserContext.getUserId();
        if (userId == null || UserContext.isGuest()) {
            return Optional.empty();
        }
        Optional<AiLlmProfileDto> fromPrefs = userAppConfigStore
                .readAiPreferences(userId)
                .flatMap(UserAiPreferencesSupport::readDefaultChatProfile);
        if (fromPrefs.isPresent()) {
            return fromPrefs;
        }
        return userAppConfigStore.readAppConfig(userId).flatMap(UserAiPreferencesSupport::readDefaultChatProfile);
    }

    /**
     * When the client sends a blank apiKey (GET masks secrets), merge the decrypted key
     * from ai-preferences.json so chat / analyze keep working after restart.
     */
    public AiLlmProfileDto fillBlankApiKey(AiLlmProfileDto client) {
        if (client == null) {
            return resolveForCurrentUser().orElse(null);
        }
        if (client.apiKey() != null && !client.apiKey().isBlank()) {
            return client;
        }
        Long userId = UserContext.getUserId();
        if (userId == null || UserContext.isGuest()) {
            return client;
        }
        Optional<Map<String, Object>> prefs = userAppConfigStore.readAiPreferences(userId);
        if (prefs.isEmpty()) {
            prefs = userAppConfigStore.readAppConfig(userId);
        }
        return prefs
                .flatMap(map -> UserAiPreferencesSupport.findStoredChatProfile(map, client))
                .map(stored -> withApiKey(client, stored.apiKey()))
                .orElse(client);
    }

    public AiChatRequest enrichChatRequest(AiChatRequest request) {
        if (request == null) {
            return null;
        }
        AiLlmProfileDto llm = fillBlankApiKey(request.llm());
        Map<String, AiLlmProfileDto> stepLlms = request.stepLlms();
        if (stepLlms != null && !stepLlms.isEmpty()) {
            Map<String, AiLlmProfileDto> filled = new LinkedHashMap<>(stepLlms.size());
            for (Map.Entry<String, AiLlmProfileDto> entry : stepLlms.entrySet()) {
                filled.put(entry.getKey(), fillBlankApiKey(entry.getValue()));
            }
            stepLlms = filled;
        }
        return new AiChatRequest(
                request.prompt(),
                request.targets(),
                llm,
                request.analysisContext(),
                request.skipSqlConfirmation(),
                request.disabledAnalysisSteps(),
                request.analysisMode(),
                stepLlms
        );
    }

    public AiSqlGenerateRequest enrichSqlRequest(AiSqlGenerateRequest request) {
        if (request == null) {
            return null;
        }
        return new AiSqlGenerateRequest(
                request.prompt(),
                request.connectionId(),
                request.database(),
                fillBlankApiKey(request.llm())
        );
    }

    private static AiLlmProfileDto withApiKey(AiLlmProfileDto client, String apiKey) {
        return new AiLlmProfileDto(
                client.provider(),
                client.baseUrl(),
                apiKey,
                client.model(),
                client.temperature(),
                client.maxTokens(),
                client.completionsPath()
        );
    }
}
