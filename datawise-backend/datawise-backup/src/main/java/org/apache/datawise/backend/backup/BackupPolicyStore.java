package org.apache.datawise.backend.backup;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.datawise.backend.backup.model.BackupPolicy;
import org.apache.datawise.backend.configstore.ConfigDirectoryService;
import org.apache.datawise.backend.configstore.ConfigPaths;
import org.apache.datawise.backend.configstore.JsonListFile;
import org.apache.datawise.backend.configstore.TenantStore;
import org.apache.datawise.backend.domain.TenantIds;
import org.apache.datawise.backend.model.TenantEntity;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class BackupPolicyStore {

    private final ConfigDirectoryService configDirectory;
    private final ObjectMapper objectMapper;
    private final TenantStore tenantStore;
    private final ConcurrentHashMap<String, JsonListFile<BackupPolicy>> cache = new ConcurrentHashMap<>();

    public BackupPolicyStore(
            ConfigDirectoryService configDirectory,
            ObjectMapper objectMapper,
            TenantStore tenantStore
    ) {
        this.configDirectory = configDirectory;
        this.objectMapper = objectMapper;
        this.tenantStore = tenantStore;
    }

    public List<BackupPolicy> list(String tenantId) {
        return fileFor(tenantId).snapshot();
    }

    public Optional<BackupPolicy> findById(String tenantId, String id) {
        if (id == null || id.isBlank()) {
            return Optional.empty();
        }
        String normalized = id.trim();
        return fileFor(tenantId).stream().filter(p -> normalized.equals(p.getId())).findFirst();
    }

    public BackupPolicy save(String tenantId, BackupPolicy policy) {
        return fileFor(tenantId).upsert(policy, existing -> existing.getId().equals(policy.getId()));
    }

    public void delete(String tenantId, String id) {
        if (id == null || id.isBlank()) {
            return;
        }
        String normalized = id.trim();
        fileFor(tenantId).removeIf(p -> normalized.equals(p.getId()));
    }

    public List<EnabledPolicyRef> listAllEnabledWithCron() {
        List<EnabledPolicyRef> refs = new ArrayList<>();
        for (TenantEntity tenant : tenantStore.listTenants()) {
            String tenantId = tenant.getId();
            for (BackupPolicy policy : list(tenantId)) {
                if (policy.isEnabled()
                        && policy.getCronExpression() != null
                        && !policy.getCronExpression().isBlank()) {
                    refs.add(new EnabledPolicyRef(tenantId, policy));
                }
            }
        }
        return refs;
    }

    private JsonListFile<BackupPolicy> fileFor(String tenantId) {
        String key = TenantIds.normalizeOrDefault(tenantId);
        return cache.computeIfAbsent(key, ignored -> new JsonListFile<>(
                configDirectory,
                objectMapper,
                ConfigPaths.tenantBackupPolicies(key),
                new TypeReference<>() {
                }
        ));
    }

    public record EnabledPolicyRef(String tenantId, BackupPolicy policy) {
    }
}
