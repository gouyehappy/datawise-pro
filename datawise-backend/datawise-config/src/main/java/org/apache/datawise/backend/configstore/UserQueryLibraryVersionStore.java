package org.apache.datawise.backend.configstore;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.datawise.backend.model.QueryLibraryVersionEntry;
import org.springframework.stereotype.Service;

import java.util.Comparator;
import java.util.List;
import java.util.Objects;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class UserQueryLibraryVersionStore {

    private final ConfigDirectoryService configDirectory;
    private final ObjectMapper objectMapper;
    private final ConcurrentHashMap<String, JsonListFile<QueryLibraryVersionEntry>> cache = new ConcurrentHashMap<>();

    public UserQueryLibraryVersionStore(ConfigDirectoryService configDirectory, ObjectMapper objectMapper) {
        this.configDirectory = configDirectory;
        this.objectMapper = objectMapper;
    }

    public List<QueryLibraryVersionEntry> listForQuery(long userId, String teamId, String queryId) {
        return fileFor(userId).stream()
                .filter(entry -> teamId.equals(entry.getTeamId()) && queryId.equals(entry.getQueryId()))
                .sorted(Comparator.comparingInt(QueryLibraryVersionEntry::getVersion).reversed())
                .toList();
    }

    public synchronized QueryLibraryVersionEntry append(long userId, QueryLibraryVersionEntry entry) {
        Objects.requireNonNull(entry.getId(), "id is required");
        return fileFor(userId).upsert(entry, existing -> existing.getId().equals(entry.getId()));
    }

    private JsonListFile<QueryLibraryVersionEntry> fileFor(long userId) {
        return cache.computeIfAbsent(TenantScopedConfigSupport.cacheKey(userId), ignored -> new JsonListFile<>(
                configDirectory,
                objectMapper,
                TenantScopedConfigSupport.ensureUserTenantFile(configDirectory, userId, "query-library-versions.json"),
                new TypeReference<>() {
                }));
    }
}
