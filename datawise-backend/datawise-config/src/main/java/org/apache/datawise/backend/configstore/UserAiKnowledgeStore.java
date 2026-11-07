package org.apache.datawise.backend.configstore;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.datawise.backend.model.AiKnowledgeEntry;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Objects;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 按注册用户隔离的业务词条（{@code config/users/{userId}/ai-knowledge.json}）。
 */
@Service
public class UserAiKnowledgeStore {

    private final ConfigDirectoryService configDirectory;
    private final ObjectMapper objectMapper;
    private final JsonListFile<AiKnowledgeEntry> legacyGlobal;
    private final ConcurrentHashMap<String, JsonListFile<AiKnowledgeEntry>> cache = new ConcurrentHashMap<>();

    public UserAiKnowledgeStore(ConfigDirectoryService configDirectory, ObjectMapper objectMapper) {
        this.configDirectory = configDirectory;
        this.objectMapper = objectMapper;
        this.legacyGlobal = new JsonListFile<>(
                configDirectory,
                objectMapper,
                ConfigPaths.AI_KNOWLEDGE,
                new TypeReference<>() {
                });
    }

    public List<AiKnowledgeEntry> listAll(long userId) {
        return entriesFor(userId).snapshot();
    }

    public List<AiKnowledgeEntry> listScoped(long userId, String connectionId, String database) {
        return entriesFor(userId).stream()
                .filter(entry -> AiKnowledgeStore.matchesScope(entry, connectionId, database))
                .toList();
    }

    public synchronized AiKnowledgeEntry upsert(long userId, AiKnowledgeEntry entry) {
        Objects.requireNonNull(entry.getId(), "id is required");
        JsonListFile<AiKnowledgeEntry> entries = entriesFor(userId);
        return entries.upsert(entry, existing -> existing.getId().equals(entry.getId()));
    }

    public synchronized void replaceAll(long userId, List<AiKnowledgeEntry> next) {
        entriesFor(userId).replaceAll(next);
    }

    public synchronized void removeById(long userId, String id) {
        entriesFor(userId).removeIf(entry -> id.equals(entry.getId()));
    }

    private JsonListFile<AiKnowledgeEntry> entriesFor(long userId) {
        return cache.computeIfAbsent(TenantScopedConfigSupport.cacheKey(userId), ignored -> loadUserEntries(userId));
    }

    private JsonListFile<AiKnowledgeEntry> loadUserEntries(long userId) {
        JsonListFile<AiKnowledgeEntry> file = new JsonListFile<>(
                configDirectory,
                objectMapper,
                TenantScopedConfigSupport.ensureUserTenantFile(configDirectory, userId, ConfigPaths.AI_KNOWLEDGE),
                new TypeReference<>() {
                });
        if (file.snapshot().isEmpty()) {
            List<AiKnowledgeEntry> legacy = legacyGlobal.snapshot();
            if (!legacy.isEmpty()) {
                file.replaceAll(legacy);
            }
        }
        return file;
    }
}
