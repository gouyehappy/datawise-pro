package org.apache.datawise.backend.configstore;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.datawise.backend.domain.TenantIds;
import org.apache.datawise.backend.model.DataQualityTemplateEntity;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Tenant-shared DQ templates: {@code tenants/{tenantId}/data-quality-templates.json}.
 * File-backed even when metadata storage is JDBC (same pattern as semantic metrics).
 */
@Service
public class FileDataQualityTemplateStore implements DataQualityTemplateStore {

    private static final int MAX_TEMPLATES = 100;

    private final ConfigDirectoryService configDirectory;
    private final ObjectMapper objectMapper;
    private final ConcurrentHashMap<String, JsonListFile<DataQualityTemplateEntity>> cache =
            new ConcurrentHashMap<>();

    public FileDataQualityTemplateStore(ConfigDirectoryService configDirectory, ObjectMapper objectMapper) {
        this.configDirectory = configDirectory;
        this.objectMapper = objectMapper;
    }

    @Override
    public List<DataQualityTemplateEntity> listByTenantId(String tenantId) {
        return fileFor(tenantId).snapshot();
    }

    @Override
    public Optional<DataQualityTemplateEntity> findById(String tenantId, String id) {
        if (id == null || id.isBlank()) {
            return Optional.empty();
        }
        String normalized = id.trim();
        return fileFor(tenantId).stream()
                .filter(item -> normalized.equals(item.getId()))
                .findFirst();
    }

    @Override
    public DataQualityTemplateEntity save(String tenantId, DataQualityTemplateEntity entity) {
        JsonListFile<DataQualityTemplateEntity> file = fileFor(tenantId);
        if (entity.getId() == null || entity.getId().isBlank()
                || file.stream().noneMatch(item -> entity.getId().equals(item.getId()))) {
            if (file.snapshot().size() >= MAX_TEMPLATES) {
                throw new IllegalArgumentException(
                        "Data-quality template limit reached (" + MAX_TEMPLATES + " per tenant)");
            }
        }
        return file.upsert(entity, existing -> existing.getId().equals(entity.getId()));
    }

    @Override
    public void delete(String tenantId, String id) {
        if (id == null || id.isBlank()) {
            return;
        }
        String normalized = id.trim();
        fileFor(tenantId).removeIf(item -> normalized.equals(item.getId()));
    }

    private JsonListFile<DataQualityTemplateEntity> fileFor(String tenantId) {
        String key = TenantIds.normalizeOrDefault(tenantId);
        return cache.computeIfAbsent(key, ignored -> new JsonListFile<>(
                configDirectory,
                objectMapper,
                ConfigPaths.tenantDataQualityTemplates(key),
                new TypeReference<>() {
                }));
    }
}
