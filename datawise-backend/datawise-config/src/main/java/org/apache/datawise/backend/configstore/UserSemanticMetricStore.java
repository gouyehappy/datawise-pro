package org.apache.datawise.backend.configstore;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.datawise.backend.model.SemanticMetricEntry;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Objects;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Stream;

@Service
public class UserSemanticMetricStore {

    private final ConfigDirectoryService configDirectory;
    private final ObjectMapper objectMapper;
    private final ConcurrentHashMap<String, JsonListFile<SemanticMetricEntry>> cache = new ConcurrentHashMap<>();

    public UserSemanticMetricStore(ConfigDirectoryService configDirectory, ObjectMapper objectMapper) {
        this.configDirectory = configDirectory;
        this.objectMapper = objectMapper;
    }

    public List<SemanticMetricEntry> listAll(long userId) {
        return fileFor(userId).snapshot();
    }

    public List<SemanticMetricEntry> listScoped(long userId, String connectionId, String database) {
        return fileFor(userId).stream()
                .filter(entry -> matchesScope(entry, connectionId, database))
                .toList();
    }

    public synchronized SemanticMetricEntry upsert(long userId, SemanticMetricEntry entry) {
        Objects.requireNonNull(entry.getId(), "id is required");
        return fileFor(userId).upsert(entry, existing -> existing.getId().equals(entry.getId()));
    }

    public synchronized void replaceAll(long userId, List<SemanticMetricEntry> next) {
        fileFor(userId).replaceAll(next != null ? next : List.of());
    }

    public synchronized void removeById(long userId, String id) {
        fileFor(userId).removeIf(entry -> id.equals(entry.getId()));
    }

    /** Drop cached mirror so the next read reloads from disk (e.g. after profile import). */
    public synchronized void invalidate(long userId) {
        cache.remove(TenantScopedConfigSupport.cacheKey(userId));
    }

    public Stream<SemanticMetricEntry> streamScoped(long userId, String connectionId, String database) {
        return listScoped(userId, connectionId, database).stream();
    }

    static boolean matchesScope(SemanticMetricEntry entry, String connectionId, String database) {
        if (entry.getConnectionId() != null && !entry.getConnectionId().isBlank()) {
            if (connectionId == null || !entry.getConnectionId().equals(connectionId)) {
                return false;
            }
        }
        if (entry.getDatabase() != null && !entry.getDatabase().isBlank()) {
            if (database == null || !entry.getDatabase().equalsIgnoreCase(database)) {
                return false;
            }
        }
        return true;
    }

    private JsonListFile<SemanticMetricEntry> fileFor(long userId) {
        return cache.computeIfAbsent(TenantScopedConfigSupport.cacheKey(userId), ignored -> new JsonListFile<>(
                configDirectory,
                objectMapper,
                TenantScopedConfigSupport.ensureUserTenantFile(configDirectory, userId, "semantic-metrics.json"),
                new TypeReference<>() {
                }));
    }
}
