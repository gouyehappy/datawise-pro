package org.apache.datawise.backend.backup;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.datawise.backend.backup.model.BackupRun;
import org.apache.datawise.backend.configstore.ConfigDirectoryService;
import org.apache.datawise.backend.configstore.ConfigPaths;
import org.apache.datawise.backend.configstore.JsonListFile;
import org.apache.datawise.backend.configstore.TenantStore;
import org.apache.datawise.backend.domain.TenantIds;
import org.apache.datawise.backend.model.TenantEntity;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class BackupRunStore {

    private static final int MAX_RUNS = 500;

    private final ConfigDirectoryService configDirectory;
    private final ObjectMapper objectMapper;
    private final TenantStore tenantStore;
    private final ConcurrentHashMap<String, JsonListFile<BackupRun>> cache = new ConcurrentHashMap<>();

    public BackupRunStore(
            ConfigDirectoryService configDirectory,
            ObjectMapper objectMapper,
            TenantStore tenantStore
    ) {
        this.configDirectory = configDirectory;
        this.objectMapper = objectMapper;
        this.tenantStore = tenantStore;
    }

    public List<BackupRun> list(String tenantId) {
        return fileFor(tenantId).snapshot().stream()
                .sorted(Comparator.comparing(BackupRun::getStartedAt, Comparator.nullsLast(Comparator.reverseOrder())))
                .toList();
    }

    public Optional<BackupRun> findById(String tenantId, String id) {
        if (id == null || id.isBlank()) {
            return Optional.empty();
        }
        String normalized = id.trim();
        return fileFor(tenantId).stream().filter(r -> normalized.equals(r.getId())).findFirst();
    }

    public Optional<LocatedRun> findByIdAnywhere(String id) {
        if (id == null || id.isBlank()) {
            return Optional.empty();
        }
        String normalized = id.trim();
        for (String tenantId : knownTenantIds()) {
            Optional<BackupRun> hit = findById(tenantId, normalized);
            if (hit.isPresent()) {
                return Optional.of(new LocatedRun(tenantId, hit.get()));
            }
        }
        return Optional.empty();
    }

    /** True when a pending/running run already exists for this policy (scheduler overlap guard). */
    public boolean hasActiveRunForPolicy(String tenantId, String policyId) {
        if (policyId == null || policyId.isBlank()) {
            return false;
        }
        return list(tenantId).stream()
                .filter(run -> policyId.equals(run.getPolicyId()))
                .anyMatch(run -> BackupRun.STATUS_PENDING.equals(run.getStatus())
                        || BackupRun.STATUS_RUNNING.equals(run.getStatus()));
    }

    /** Latest finished success/partial for a policy — used by the scheduler due check. */
    public Optional<Instant> lastSuccessfulFinishedAt(String tenantId, String policyId) {
        if (policyId == null || policyId.isBlank()) {
            return Optional.empty();
        }
        return list(tenantId).stream()
                .filter(run -> policyId.equals(run.getPolicyId()))
                .filter(run -> BackupRun.STATUS_SUCCESS.equals(run.getStatus())
                        || BackupRun.STATUS_PARTIAL.equals(run.getStatus()))
                .map(BackupRun::getFinishedAt)
                .filter(at -> at != null)
                .max(Instant::compareTo);
    }

    public BackupRun save(String tenantId, BackupRun run) {
        if (run.getTenantId() == null || run.getTenantId().isBlank()) {
            run.setTenantId(TenantIds.normalizeOrDefault(tenantId));
        }
        JsonListFile<BackupRun> file = fileFor(tenantId);
        file.upsert(run, existing -> existing.getId().equals(run.getId()));
        trimOldRuns(file);
        return run;
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

    private void trimOldRuns(JsonListFile<BackupRun> file) {
        List<BackupRun> sorted = file.snapshot().stream()
                .sorted(Comparator.comparing(BackupRun::getStartedAt, Comparator.nullsLast(Comparator.reverseOrder())))
                .toList();
        if (sorted.size() <= MAX_RUNS) {
            return;
        }
        List<BackupRun> keep = sorted.subList(0, MAX_RUNS);
        file.replaceAll(keep);
    }

    private JsonListFile<BackupRun> fileFor(String tenantId) {
        String key = TenantIds.normalizeOrDefault(tenantId);
        return cache.computeIfAbsent(key, ignored -> new JsonListFile<>(
                configDirectory,
                objectMapper,
                ConfigPaths.tenantBackupRuns(key),
                new TypeReference<>() {
                }
        ));
    }

    public record LocatedRun(String tenantId, BackupRun run) {
    }
}
