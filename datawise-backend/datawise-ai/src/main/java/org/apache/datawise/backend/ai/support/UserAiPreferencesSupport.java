package org.apache.datawise.backend.ai.support;

import org.apache.datawise.backend.ai.domain.AiEmbeddingProfileDto;
import org.apache.datawise.backend.ai.domain.AiLlmProfileDto;

import java.util.List;
import java.util.Map;
import java.util.Optional;

/** 从 app.xml ai 节解析 LLM / Embedding 配置。 */
public final class UserAiPreferencesSupport {

    private UserAiPreferencesSupport() {
    }

    @SuppressWarnings("unchecked")
    public static Optional<AiLlmProfileDto> readDefaultChatProfile(Map<String, Object> appConfig) {
        if (appConfig == null) {
            return Optional.empty();
        }
        Object aiRaw = appConfig.get("ai");
        if (aiRaw instanceof Map<?, ?> ai) {
            return readDefaultChatProfileFromAiSection((Map<String, Object>) ai);
        }
        // Bare ai-preferences.json payload (llmProfiles at top level).
        if (appConfig.containsKey("llmProfiles")) {
            return readDefaultChatProfileFromAiSection(appConfig);
        }
        return Optional.empty();
    }

    /**
     * Resolve a stored profile whose apiKey can fill a client profile that was masked on GET.
     * Match by baseUrl+model when possible; otherwise fall back to the default chat profile.
     */
    public static Optional<AiLlmProfileDto> findStoredChatProfile(
            Map<String, Object> aiPrefs,
            AiLlmProfileDto client
    ) {
        if (aiPrefs == null || aiPrefs.isEmpty()) {
            return Optional.empty();
        }
        Map<String, Object> section = aiPrefs;
        Object nested = aiPrefs.get("ai");
        if (nested instanceof Map<?, ?> aiMap) {
            @SuppressWarnings("unchecked")
            Map<String, Object> cast = (Map<String, Object>) aiMap;
            section = cast;
        }
        Object profilesRaw = section.get("llmProfiles");
        if (!(profilesRaw instanceof List<?> profiles) || profiles.isEmpty()) {
            return Optional.empty();
        }
        String wantBase = client != null ? stringValue(client.baseUrl()) : "";
        String wantModel = client != null ? stringValue(client.model()) : "";
        AiLlmProfileDto firstWithKey = null;
        for (Object item : profiles) {
            if (!(item instanceof Map<?, ?> map)) {
                continue;
            }
            @SuppressWarnings("unchecked")
            AiLlmProfileDto profile = parseLlmProfile((Map<String, Object>) map);
            if (profile == null || profile.apiKey() == null || profile.apiKey().isBlank()) {
                continue;
            }
            if (firstWithKey == null) {
                firstWithKey = profile;
            }
            if (!wantBase.isBlank()
                    && wantBase.equalsIgnoreCase(stringValue(profile.baseUrl()))
                    && wantModel.equals(stringValue(profile.model()))) {
                return Optional.of(profile);
            }
        }
        Optional<AiLlmProfileDto> defaults = readDefaultChatProfileFromAiSection(section);
        if (defaults.isPresent()
                && defaults.get().apiKey() != null
                && !defaults.get().apiKey().isBlank()) {
            return defaults;
        }
        return Optional.ofNullable(firstWithKey);
    }

    @SuppressWarnings("unchecked")
    private static Optional<AiLlmProfileDto> readDefaultChatProfileFromAiSection(Map<String, Object> ai) {
        Object profilesRaw = ai.get("llmProfiles");
        if (!(profilesRaw instanceof List<?> profiles) || profiles.isEmpty()) {
            return Optional.empty();
        }
        String defaultId = stringValue(ai.get("defaultLlmId"));
        String workbenchId = stringValue(ai.get("workbenchLlmId"));
        String preferredId = !workbenchId.isBlank() ? workbenchId : defaultId;
        for (Object item : profiles) {
            if (!(item instanceof Map<?, ?> map)) {
                continue;
            }
            String id = stringValue(map.get("id"));
            if (!preferredId.isBlank() && !preferredId.equals(id)) {
                continue;
            }
            AiLlmProfileDto profile = parseLlmProfile((Map<String, Object>) map);
            if (profile != null) {
                return Optional.of(profile);
            }
        }
        Object first = profiles.get(0);
        if (first instanceof Map<?, ?> map) {
            return Optional.ofNullable(parseLlmProfile((Map<String, Object>) map));
        }
        return Optional.empty();
    }

    @SuppressWarnings("unchecked")
    public static Optional<AiEmbeddingProfileDto> readDefaultEmbeddingProfile(Map<String, Object> appConfig) {
        if (appConfig == null) {
            return Optional.empty();
        }
        Object aiRaw = appConfig.get("ai");
        if (!(aiRaw instanceof Map<?, ?> ai)) {
            return Optional.empty();
        }
        Object profilesRaw = ai.get("embeddingProfiles");
        if (profilesRaw instanceof List<?> profiles && !profiles.isEmpty()) {
            String defaultId = stringValue(ai.get("defaultEmbeddingId"));
            for (Object item : profiles) {
                if (!(item instanceof Map<?, ?> map)) {
                    continue;
                }
                String id = stringValue(map.get("id"));
                if (defaultId != null && !defaultId.isBlank() && !defaultId.equals(id)) {
                    continue;
                }
                AiEmbeddingProfileDto profile = parseEmbedding((Map<String, Object>) map);
                if (profile != null) {
                    return Optional.of(profile);
                }
            }
            Object first = profiles.get(0);
            if (first instanceof Map<?, ?> map) {
                return Optional.ofNullable(parseEmbedding((Map<String, Object>) map));
            }
            return Optional.empty();
        }
        Object embeddingRaw = ai.get("embedding");
        if (embeddingRaw instanceof Map<?, ?> embeddingMap) {
            return Optional.ofNullable(parseEmbedding((Map<String, Object>) embeddingMap));
        }
        return Optional.empty();
    }

    public static AiEmbeddingProfileDto mergeEmbeddingConnection(
            AiEmbeddingProfileDto embedding,
            Optional<AiLlmProfileDto> chatProfile
    ) {
        if (embedding == null) {
            return null;
        }
        if (!embedding.usesChatConnection() || chatProfile.isEmpty()) {
            return embedding;
        }
        AiLlmProfileDto chat = chatProfile.get();
        return new AiEmbeddingProfileDto(
                embedding.provider(),
                chat.baseUrl(),
                chat.apiKey(),
                embedding.model(),
                embedding.dimensions(),
                embedding.embeddingsPath(),
                embedding.useChatConnection()
        );
    }

    static AiLlmProfileDto parseLlmProfile(Map<String, Object> map) {
        if (map == null || map.isEmpty()) {
            return null;
        }
        return new AiLlmProfileDto(
                stringValue(map.get("provider")),
                stringValue(map.get("baseUrl")),
                stringValue(map.get("apiKey")),
                stringValue(map.get("model")),
                doubleValue(map.get("temperature")),
                intValue(map.get("maxTokens")),
                stringValue(map.get("completionsPath"))
        );
    }

    public static AiEmbeddingProfileDto parseEmbedding(Map<String, Object> raw) {
        if (raw == null || raw.isEmpty()) {
            return new AiEmbeddingProfileDto("hash", "", "", "", null, null, false);
        }
        return new AiEmbeddingProfileDto(
                stringValue(raw.get("provider")),
                stringValue(raw.get("baseUrl")),
                stringValue(raw.get("apiKey")),
                stringValue(raw.get("model")),
                intValue(raw.get("dimensions")),
                stringValue(raw.get("embeddingsPath")),
                boolValue(raw.get("useChatConnection"))
        );
    }

    private static String stringValue(Object raw) {
        return raw instanceof String value ? value.trim() : "";
    }

    private static Integer intValue(Object raw) {
        if (raw instanceof Number number) {
            int value = number.intValue();
            return value > 0 ? value : null;
        }
        return null;
    }

    private static Double doubleValue(Object raw) {
        if (raw instanceof Number number) {
            return number.doubleValue();
        }
        return null;
    }

    private static Boolean boolValue(Object raw) {
        if (raw instanceof Boolean value) {
            return value;
        }
        return null;
    }
}
