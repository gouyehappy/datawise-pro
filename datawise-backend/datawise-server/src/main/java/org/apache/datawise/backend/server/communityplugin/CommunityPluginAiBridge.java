package org.apache.datawise.backend.server.communityplugin;

import org.apache.datawise.backend.ai.chat.AiService;
import org.apache.datawise.backend.ai.domain.AiChatReply;
import org.apache.datawise.backend.ai.domain.AiLlmProfileDto;
import org.apache.datawise.backend.ai.support.UserAiLlmResolver;
import org.apache.datawise.backend.configstore.UserAppConfigStore;
import org.apache.datawise.backend.domain.communityplugin.CommunityPluginException;
import org.apache.datawise.backend.security.UserContext;
import org.springframework.boot.autoconfigure.condition.ConditionalOnBean;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * host.ai — plugins may query whether the current user has a default chat LLM
 * and run a simple chat turn. API keys stay on the host. Declared via
 * permission {@code host.ai}.
 */
@Service
@ConditionalOnBean(AiService.class)
public class CommunityPluginAiBridge {

    public static final int MAX_PROMPT_CHARS = 100_000;

    private final CommunityPluginInstaller installer;
    private final AiService aiService;
    private final UserAiLlmResolver userAiLlmResolver;
    private final UserAppConfigStore userAppConfigStore;

    public CommunityPluginAiBridge(
            CommunityPluginInstaller installer,
            AiService aiService,
            UserAiLlmResolver userAiLlmResolver,
            UserAppConfigStore userAppConfigStore
    ) {
        this.installer = installer;
        this.aiService = aiService;
        this.userAiLlmResolver = userAiLlmResolver;
        this.userAppConfigStore = userAppConfigStore;
    }

    public AiStatusDto status(String pluginId) {
        requireHostAi(pluginId);
        Optional<AiLlmProfileDto> llm = userAiLlmResolver.resolveForCurrentUser();
        if (llm.isEmpty() || llm.get().apiKey() == null || llm.get().apiKey().isBlank()) {
            return new AiStatusDto(false, null, null);
        }
        String profileName = resolveProfileDisplayName().orElse(llm.get().model());
        return new AiStatusDto(true, blankToNull(profileName), blankToNull(llm.get().model()));
    }

    public AiChatDto chat(String pluginId, PluginAiChatRequest request) {
        requireHostAi(pluginId);
        if (request == null || request.prompt() == null || request.prompt().isBlank()) {
            throw new IllegalArgumentException("prompt is required");
        }
        if (request.prompt().length() > MAX_PROMPT_CHARS) {
            throw new IllegalArgumentException("prompt exceeds host.ai size limit");
        }
        Optional<AiLlmProfileDto> llm = userAiLlmResolver.resolveForCurrentUser();
        if (llm.isEmpty() || llm.get().apiKey() == null || llm.get().apiKey().isBlank()) {
            throw new CommunityPluginException("host AI is not configured");
        }
        // Pass systemPrompt as the LLM system role (not concatenated into user).
        AiChatReply reply = aiService.pluginChat(llm.get(), request.systemPrompt(), request.prompt());
        String text = reply != null && reply.reply() != null ? reply.reply() : "";
        String profileName = resolveProfileDisplayName().orElse(llm.get().model());
        return new AiChatDto(text, "host", blankToNull(profileName), blankToNull(llm.get().model()));
    }

    /**
     * Streaming host.ai chat. {@code onDelta} receives each content chunk;
     * the returned DTO holds the full reply (same shape as {@link #chat}).
     */
    public AiChatDto chatStream(
            String pluginId,
            PluginAiChatRequest request,
            java.util.function.Consumer<String> onDelta
    ) {
        requireHostAi(pluginId);
        if (request == null || request.prompt() == null || request.prompt().isBlank()) {
            throw new IllegalArgumentException("prompt is required");
        }
        if (request.prompt().length() > MAX_PROMPT_CHARS) {
            throw new IllegalArgumentException("prompt exceeds host.ai size limit");
        }
        Optional<AiLlmProfileDto> llm = userAiLlmResolver.resolveForCurrentUser();
        if (llm.isEmpty() || llm.get().apiKey() == null || llm.get().apiKey().isBlank()) {
            throw new CommunityPluginException("host AI is not configured");
        }
        AiChatReply reply = aiService.pluginChatStream(
                llm.get(),
                request.systemPrompt(),
                request.prompt(),
                onDelta
        );
        String text = reply != null && reply.reply() != null ? reply.reply() : "";
        String profileName = resolveProfileDisplayName().orElse(llm.get().model());
        return new AiChatDto(text, "host", blankToNull(profileName), blankToNull(llm.get().model()));
    }

    private Optional<String> resolveProfileDisplayName() {
        Long userId = UserContext.getUserId();
        if (userId == null || UserContext.isGuest()) {
            return Optional.empty();
        }
        Optional<Map<String, Object>> prefs = userAppConfigStore.readAiPreferences(userId);
        if (prefs.isEmpty()) {
            prefs = userAppConfigStore.readAppConfig(userId);
        }
        if (prefs.isEmpty()) {
            return Optional.empty();
        }
        Map<String, Object> section = prefs.get();
        Object nested = section.get("ai");
        if (nested instanceof Map<?, ?> aiMap) {
            @SuppressWarnings("unchecked")
            Map<String, Object> cast = (Map<String, Object>) aiMap;
            section = cast;
        }
        Object profilesRaw = section.get("llmProfiles");
        if (!(profilesRaw instanceof List<?> profiles) || profiles.isEmpty()) {
            return Optional.empty();
        }
        String defaultId = stringValue(section.get("defaultLlmId"));
        String workbenchId = stringValue(section.get("workbenchLlmId"));
        String preferredId = !workbenchId.isBlank() ? workbenchId : defaultId;
        for (Object item : profiles) {
            if (!(item instanceof Map<?, ?> map)) {
                continue;
            }
            String id = stringValue(map.get("id"));
            if (!preferredId.isBlank() && !preferredId.equals(id)) {
                continue;
            }
            String name = stringValue(map.get("name"));
            if (!name.isBlank()) {
                return Optional.of(name);
            }
            String model = stringValue(map.get("model"));
            return model.isBlank() ? Optional.empty() : Optional.of(model);
        }
        Object first = profiles.get(0);
        if (first instanceof Map<?, ?> map) {
            String name = stringValue(map.get("name"));
            if (!name.isBlank()) {
                return Optional.of(name);
            }
            String model = stringValue(map.get("model"));
            return model.isBlank() ? Optional.empty() : Optional.of(model);
        }
        return Optional.empty();
    }

    private void requireHostAi(String pluginId) {
        boolean allowed = installer.findInstalled(pluginId)
                .map(installed -> installed.manifest().permissions())
                .filter(list -> list != null && list.contains("host.ai"))
                .isPresent();
        if (!allowed) {
            throw new CommunityPluginException("permission host.ai is required");
        }
    }

    private static String stringValue(Object value) {
        return value == null ? "" : String.valueOf(value).trim();
    }

    private static String blankToNull(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return value.trim();
    }

    public record AiStatusDto(boolean configured, String profileName, String model) {
    }

    public record PluginAiChatRequest(String prompt, String systemPrompt) {
    }

    public record AiChatDto(String reply, String source, String profileName, String model) {
    }
}
