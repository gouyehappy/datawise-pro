package org.apache.datawise.backend.backup;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.datawise.backend.backup.model.RestoreJob;
import org.apache.datawise.backend.configstore.ConfigDirectoryService;
import org.apache.datawise.backend.configstore.ConfigPaths;
import org.apache.datawise.backend.configstore.JsonListFile;
import org.apache.datawise.backend.configstore.TenantStore;
import org.apache.datawise.backend.domain.TenantIds;
import org.apache.datawise.backend.model.TenantEntity;
import org.springframework.stereotype.Service;

import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class RestoreJobStore {

    private static final int MAX_JOBS = 200;

    private final ConfigDirectoryService configDirectory;
    private final ObjectMapper objectMapper;
    private final TenantStore tenantStore;
    private final ConcurrentHashMap<String, JsonListFile<RestoreJob>> cache = new ConcurrentHashMap<>();

    public RestoreJobStore(
            ConfigDirectoryService configDirectory,
            ObjectMapper objectMapper,
            TenantStore tenantStore
    ) {
        this.configDirectory = configDirectory;
        this.objectMapper = objectMapper;
        this.tenantStore = tenantStore;
    }

    public List<RestoreJob> list(String tenantId) {
        return fileFor(tenantId).snapshot().stream()
                .sorted(Comparator.comparing(RestoreJob::getStartedAt, Comparator.nullsLast(Comparator.reverseOrder())))
                .toList();
    }

    public Optional<RestoreJob> findById(String tenantId, String id) {
        if (id == null || id.isBlank()) {
            return Optional.empty();
        }
        String normalized = id.trim();
        return fileFor(tenantId).stream().filter(j -> normalized.equals(j.getId())).findFirst();
    }

    public Optional<LocatedJob> findByIdAnywhere(String id) {
        if (id == null || id.isBlank()) {
            return Optional.empty();
        }
        String normalized = id.trim();
        for (String tenantId : knownTenantIds()) {
            Optional<RestoreJob> hit = findById(tenantId, normalized);
            if (hit.isPresent()) {
                return Optional.of(new LocatedJob(tenantId, hit.get()));
            }
        }
        return Optional.empty();
    }

    public RestoreJob save(String tenantId, RestoreJob job) {
        if (job.getTenantId() == null || job.getTenantId().isBlank()) {
            job.setTenantId(TenantIds.normalizeOrDefault(tenantId));
        }
        JsonListFile<RestoreJob> file = fileFor(tenantId);
        file.upsert(job, existing -> existing.getId().equals(job.getId()));
        trimOldJobs(file);
        return job;
    }

    private Set<String> knownTenantIds() {
        Set<String> ids = new LinkedHashSet<>();
        ids.add(TenantIds.DEFAULT);
        for (TenantEntity tenant : tenantStore.listTenants()) {
            if (tenant != null && tenant.getId() != null && !tenant.getId().isBlank()) {
                ids.add(TenantIds.normalizeOrDefault(tenant.getId()));
            }
        }
        return ids;
    }

    private void trimOldJobs(JsonListFile<RestoreJob> file) {
        List<RestoreJob> sorted = file.snapshot().stream()
                .sorted(Comparator.comparing(RestoreJob::getStartedAt, Comparator.nullsLast(Comparator.reverseOrder())))
                .toList();
        if (sorted.size() <= MAX_JOBS) {
            return;
        }
        file.replaceAll(sorted.subList(0, MAX_JOBS));
    }

    private JsonListFile<RestoreJob> fileFor(String tenantId) {
        String key = TenantIds.normalizeOrDefault(tenantId);
        return cache.computeIfAbsent(key, ignored -> new JsonListFile<>(
                configDirectory,
                objectMapper,
                ConfigPaths.tenantRestoreJobs(key),
                new TypeReference<>() {
                }
        ));
    }

    public record LocatedJob(String tenantId, RestoreJob job) {
    }
}
