package org.apache.datawise.backend.configstore;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.datawise.backend.model.AiTableTagEntry;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

@Service
public class UserAiTableTagStore {

    private final ConfigDirectoryService configDirectory;
    private final ObjectMapper objectMapper;
    private final ConcurrentHashMap<String, JsonListFile<AiTableTagEntry>> cache = new ConcurrentHashMap<>();

    public UserAiTableTagStore(ConfigDirectoryService configDirectory, ObjectMapper objectMapper) {
        this.configDirectory = configDirectory;
        this.objectMapper = objectMapper;
    }

    public List<AiTableTagEntry> listAll(long userId) {
        return fileFor(userId).snapshot();
    }

    public List<AiTableTagEntry> listScoped(long userId, String connectionId, String database) {
        return fileFor(userId).stream()
                .filter(entry -> matchesScope(entry, connectionId, database))
                .toList();
    }

    public synchronized AiTableTagEntry upsert(long userId, AiTableTagEntry entry) {
        Objects.requireNonNull(entry.getId(), "id is required");
        return fileFor(userId).upsert(entry, existing -> existing.getId().equals(entry.getId()));
    }

    public synchronized void removeById(long userId, String id) {
        fileFor(userId).removeIf(entry -> id.equals(entry.getId()));
    }

    public synchronized void removeScoped(long userId, String connectionId, String database, String tableName) {
        fileFor(userId).removeIf(entry -> matchesTable(entry, connectionId, database, tableName));
    }

    /** Removes every tag that belongs to the given connection (e.g. after connection delete). */
    public synchronized void removeByConnectionId(long userId, String connectionId) {
        if (connectionId == null || connectionId.isBlank()) {
            return;
        }
        String normalized = connectionId.trim();
        fileFor(userId).removeIf(entry -> entry.getConnectionId() != null && normalized.equals(entry.getConnectionId().trim()));
    }

    /**
     * Drops tags whose connectionId is missing from {@code validConnectionIds}
     * (self-heal after connections were deleted without cascade cleanup).
     */
    public synchronized int removeMissingConnections(long userId, Set<String> validConnectionIds) {
        Set<String> valid = validConnectionIds != null ? validConnectionIds : Set.of();
        AtomicInteger removed = new AtomicInteger();
        fileFor(userId).removeIf(entry -> {
            String connectionId = entry.getConnectionId();
            boolean orphan = connectionId == null
                    || connectionId.isBlank()
                    || !valid.contains(connectionId.trim());
            if (orphan) {
                removed.incrementAndGet();
            }
            return orphan;
        });
        return removed.get();
    }

    public synchronized AiTableTagEntry replaceScoped(long userId, AiTableTagEntry entry) {
        Objects.requireNonNull(entry.getId(), "id is required");
        fileFor(userId).removeIf(existing -> matchesTable(
                existing,
                entry.getConnectionId(),
                entry.getDatabase(),
                entry.getTableName()));
        return fileFor(userId).append(entry);
    }

    static boolean matchesTable(AiTableTagEntry entry, String connectionId, String database, String tableName) {
        if (connectionId == null || connectionId.isBlank() || entry.getConnectionId() == null) {
            return false;
        }
        if (!connectionId.trim().equals(entry.getConnectionId().trim())) {
            return false;
        }
        if (database != null && !database.isBlank() && entry.getDatabase() != null && !entry.getDatabase().isBlank()) {
            if (!database.trim().equalsIgnoreCase(entry.getDatabase().trim())) {
                return false;
            }
        }
        if (tableName == null || tableName.isBlank() || entry.getTableName() == null || entry.getTableName().isBlank()) {
            return false;
        }
        return tableName.trim().equalsIgnoreCase(entry.getTableName().trim());
    }

    static boolean matchesScope(AiTableTagEntry entry, String connectionId, String database) {
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

    private JsonListFile<AiTableTagEntry> fileFor(long userId) {
        return cache.computeIfAbsent(TenantScopedConfigSupport.cacheKey(userId), ignored -> new JsonListFile<>(
                configDirectory,
                objectMapper,
                TenantScopedConfigSupport.ensureUserTenantFile(configDirectory, userId, "ai-table-tags.json"),
                new TypeReference<>() {
                }));
    }
}
