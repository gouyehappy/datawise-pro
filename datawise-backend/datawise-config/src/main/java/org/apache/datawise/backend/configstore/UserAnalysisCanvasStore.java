package org.apache.datawise.backend.configstore;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.datawise.backend.model.AiAnalysisCanvasEntry;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Objects;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class UserAnalysisCanvasStore {

    private final ConfigDirectoryService configDirectory;
    private final ObjectMapper objectMapper;
    private final ConcurrentHashMap<String, JsonListFile<AiAnalysisCanvasEntry>> cache = new ConcurrentHashMap<>();

    public UserAnalysisCanvasStore(ConfigDirectoryService configDirectory, ObjectMapper objectMapper) {
        this.configDirectory = configDirectory;
        this.objectMapper = objectMapper;
    }

    public List<AiAnalysisCanvasEntry> listAll(long userId) {
        return fileFor(userId).snapshot();
    }

    public synchronized AiAnalysisCanvasEntry upsert(long userId, AiAnalysisCanvasEntry entry) {
        Objects.requireNonNull(entry.getId(), "id is required");
        return fileFor(userId).upsert(entry, existing -> existing.getId().equals(entry.getId()));
    }

    public synchronized void removeById(long userId, String id) {
        fileFor(userId).removeIf(entry -> id.equals(entry.getId()));
    }

    public AiAnalysisCanvasEntry findById(long userId, String id) {
        return fileFor(userId).stream()
                .filter(entry -> id.equals(entry.getId()))
                .findFirst()
                .orElse(null);
    }

    private JsonListFile<AiAnalysisCanvasEntry> fileFor(long userId) {
        return cache.computeIfAbsent(TenantScopedConfigSupport.cacheKey(userId), ignored -> new JsonListFile<>(
                configDirectory,
                objectMapper,
                TenantScopedConfigSupport.ensureUserTenantFile(configDirectory, userId, "analysis-canvas.json"),
                new TypeReference<>() {
                }));
    }
}
