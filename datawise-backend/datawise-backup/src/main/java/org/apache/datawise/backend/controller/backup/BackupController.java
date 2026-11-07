package org.apache.datawise.backend.controller.backup;

import org.apache.datawise.backend.backup.BackupArtifactStore;
import org.apache.datawise.backend.backup.BackupPolicyStore;
import org.apache.datawise.backend.backup.model.BackupManifest;
import org.apache.datawise.backend.backup.model.BackupPolicy;
import org.apache.datawise.backend.backup.model.BackupRun;
import org.apache.datawise.backend.backup.model.BackupStatsDocument;
import org.apache.datawise.backend.backup.model.RestoreJob;
import org.apache.datawise.backend.common.ApiResponse;
import org.apache.datawise.backend.common.support.IdGenerator;
import org.apache.datawise.backend.database.backup.DatabaseRestoreService;
import org.apache.datawise.backend.config.BackupProperties;
import org.apache.datawise.backend.security.UserContext;
import org.apache.datawise.backend.server.backup.BackupOrchestrator;
import org.apache.datawise.backend.domain.pack.MigrationAccessGate;
import org.apache.datawise.backend.service.UserAdminPolicy;
import org.apache.datawise.backend.service.tenant.PlatformAdminPolicy;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.nio.file.Path;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/backup")
public class BackupController {

    private final UserAdminPolicy userAdminPolicy;
    private final PlatformAdminPolicy platformAdminPolicy;
    private final BackupPolicyStore policyStore;
    private final BackupOrchestrator orchestrator;
    private final BackupArtifactStore artifactStore;
    private final BackupProperties backupProperties;
    private final MigrationAccessGate migrationAccessGate;

    public BackupController(
            UserAdminPolicy userAdminPolicy,
            PlatformAdminPolicy platformAdminPolicy,
            BackupPolicyStore policyStore,
            BackupOrchestrator orchestrator,
            BackupArtifactStore artifactStore,
            BackupProperties backupProperties,
            MigrationAccessGate migrationAccessGate
    ) {
        this.userAdminPolicy = userAdminPolicy;
        this.platformAdminPolicy = platformAdminPolicy;
        this.policyStore = policyStore;
        this.orchestrator = orchestrator;
        this.artifactStore = artifactStore;
        this.backupProperties = backupProperties;
        this.migrationAccessGate = migrationAccessGate;
    }

    @GetMapping("/policies")
    public ApiResponse<List<BackupPolicy>> listPolicies() {
        requireBackupAdmin();
        return ApiResponse.ok(policyStore.list(tenantId()));
    }

    @PostMapping("/policies")
    public ApiResponse<BackupPolicy> createPolicy(@RequestBody BackupPolicy request) {
        requireBackupAdmin();
        BackupPolicy policy = preparePolicy(request, true);
        return ApiResponse.ok(policyStore.save(tenantId(), policy));
    }

    @PutMapping("/policies/{id}")
    public ApiResponse<BackupPolicy> updatePolicy(@PathVariable String id, @RequestBody BackupPolicy request) {
        requireBackupAdmin();
        policyStore.findById(tenantId(), id).orElseThrow(() -> new IllegalArgumentException("policy not found: " + id));
        BackupPolicy policy = preparePolicy(request, false);
        policy.setId(id);
        return ApiResponse.ok(policyStore.save(tenantId(), policy));
    }

    @DeleteMapping("/policies/{id}")
    public ApiResponse<Void> deletePolicy(
            @PathVariable String id,
            @RequestParam(required = false, defaultValue = "false") boolean purgeArtifacts
    ) throws Exception {
        requireBackupAdmin();
        policyStore.delete(tenantId(), id);
        if (purgeArtifacts) {
            BackupPolicy policy = new BackupPolicy();
            policy.setDestinationRoot(null);
            Path root = artifactStore.resolveRoot(tenantId(), policy);
            for (BackupArtifactStore.ArtifactSummary summary : artifactStore.listArtifacts(root, null, null, null)) {
                if (id.equals(summary.artifactId())) {
                    artifactStore.deleteArtifact(Path.of(summary.path()));
                }
            }
        }
        return ApiResponse.ok(null);
    }

    @PostMapping("/policies/{id}/run")
    public ApiResponse<BackupRun> runPolicy(@PathVariable String id) {
        requireBackupAdmin();
        return ApiResponse.ok(orchestrator.runPolicy(tenantId(), id, BackupRun.TRIGGER_MANUAL));
    }

    /** §1.2 — one-shot ad-hoc backup stays free (no cron / retention / restore). */
    @PostMapping("/runs")
    public ApiResponse<BackupRun> startRun(@RequestBody BackupPolicy request) {
        requireAdminOnly();
        BackupPolicy policy = sanitizeAdHocRun(request);
        return ApiResponse.ok(orchestrator.startAdHocRun(tenantId(), policy, BackupRun.TRIGGER_API));
    }

    @GetMapping("/runs")
    public ApiResponse<List<BackupRun>> listRuns() {
        requireAdminOnly();
        return ApiResponse.ok(orchestrator.listRuns(tenantId()));
    }

    @GetMapping("/runs/{id}")
    public ApiResponse<BackupRun> getRun(@PathVariable String id) {
        requireAdminOnly();
        return ApiResponse.ok(orchestrator.getRun(tenantId(), id));
    }

    @PostMapping("/runs/{id}/cancel")
    public ApiResponse<BackupRun> cancelRun(@PathVariable String id) {
        requireAdminOnly();
        return ApiResponse.ok(orchestrator.cancelRun(tenantId(), id));
    }

    @GetMapping("/artifacts")
    public ApiResponse<List<BackupArtifactStore.ArtifactSummary>> listArtifacts(
            @RequestParam(required = false) String type,
            @RequestParam(required = false) String connectionId,
            @RequestParam(required = false) String database
    ) throws Exception {
        requireAdminOnly();
        Path root = artifactStore.resolveRoot(tenantId(), (BackupPolicy) null);
        return ApiResponse.ok(artifactStore.listArtifacts(root, type, connectionId, database));
    }

    @GetMapping("/artifacts/{id}")
    public ApiResponse<BackupManifest> getArtifactManifest(@PathVariable String id) throws Exception {
        requireAdminOnly();
        Path root = artifactStore.resolveRoot(tenantId(), (BackupPolicy) null);
        Path dir = artifactStore.findArtifactDir(root, id)
                .orElseThrow(() -> new IllegalArgumentException("artifact not found: " + id));
        return ApiResponse.ok(artifactStore.readManifest(dir));
    }

    @GetMapping("/artifacts/{id}/stats")
    public ApiResponse<BackupStatsDocument> getArtifactStats(@PathVariable String id) throws Exception {
        requireAdminOnly();
        Path root = artifactStore.resolveRoot(tenantId(), (BackupPolicy) null);
        Path dir = artifactStore.findArtifactDir(root, id)
                .orElseThrow(() -> new IllegalArgumentException("artifact not found: " + id));
        BackupStatsDocument stats = artifactStore.readStats(dir);
        if (stats == null) {
            BackupManifest manifest = artifactStore.readManifest(dir);
            BackupStatsDocument synthesized = new BackupStatsDocument();
            synthesized.setLayout(BackupStatsDocument.LAYOUT_SINGLE_FILE);
            if (manifest != null && manifest.getDatabase() != null) {
                if (manifest.getDatabase().getTableCount() != null) {
                    synthesized.setTableCount(manifest.getDatabase().getTableCount());
                }
                if (manifest.getDatabase().getRowEstimate() != null) {
                    synthesized.setTotalRows(manifest.getDatabase().getRowEstimate());
                }
                if (manifest.getDatabase().getDurationMs() != null) {
                    synthesized.setDurationMs(manifest.getDatabase().getDurationMs());
                }
            }
            return ApiResponse.ok(synthesized);
        }
        return ApiResponse.ok(stats);
    }

    @DeleteMapping("/artifacts/{id}")
    public ApiResponse<Void> deleteArtifact(@PathVariable String id) throws Exception {
        requireAdminOnly();
        Path root = artifactStore.resolveRoot(tenantId(), (BackupPolicy) null);
        Path dir = artifactStore.findArtifactDir(root, id)
                .orElseThrow(() -> new IllegalArgumentException("artifact not found: " + id));
        artifactStore.deleteArtifact(dir);
        return ApiResponse.ok(null);
    }

    @PostMapping("/restore/preflight")
    public ApiResponse<DatabaseRestoreService.DatabaseRestorePreflight> preflightRestore(
            @RequestBody RestorePreflightRequest request
    ) throws Exception {
        requireBackupAdmin();
        return ApiResponse.ok(orchestrator.preflightRestore(
                tenantId(),
                request.artifactId(),
                request.artifactPath(),
                request.targetConnectionId(),
                request.targetDatabase(),
                request.productionAck()
        ));
    }

    @PostMapping("/restore/jobs")
    public ApiResponse<RestoreJob> startRestore(@RequestBody RestoreJob request) throws Exception {
        requireBackupAdmin();
        if (BackupPolicy.TYPE_WORKBENCH.equals(request.getType())
                && RestoreJob.MODE_FULL.equals(request.getMode())) {
            platformAdminPolicy.requirePlatformAdmin();
        }
        return ApiResponse.ok(orchestrator.startRestore(tenantId(), request));
    }

    @GetMapping("/restore/jobs/{id}")
    public ApiResponse<RestoreJob> getRestoreJob(@PathVariable String id) {
        requireBackupAdmin();
        return ApiResponse.ok(orchestrator.getRestoreJob(tenantId(), id));
    }

    @PostMapping("/restore/jobs/{id}/cancel")
    public ApiResponse<RestoreJob> cancelRestoreJob(@PathVariable String id) {
        requireBackupAdmin();
        return ApiResponse.ok(orchestrator.cancelRestoreJob(tenantId(), id));
    }

    @GetMapping("/health")
    public ApiResponse<Map<String, Object>> health() throws Exception {
        requireAdminOnly();
        Path root = artifactStore.resolveRoot(tenantId(), (BackupPolicy) null);
        long freeBytes = artifactStore.freeBytes(root);
        List<Map<String, Object>> overdue = List.of();
        if (migrationAccessGate.isBackupEntitled()) {
            overdue = policyStore.list(tenantId()).stream()
                    .filter(BackupPolicy::isEnabled)
                    .filter(p -> p.getCronExpression() != null && !p.getCronExpression().isBlank())
                    .filter(p -> isOverdue(p))
                    .map(p -> Map.<String, Object>of("policyId", p.getId(), "name", p.getName()))
                    .toList();
        }
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("freeBytes", freeBytes);
        body.put("diskMinFreeBytes", backupProperties.getDiskMinFreeBytes());
        body.put("overduePolicies", overdue);
        body.put("backupPackRequired", !migrationAccessGate.isBackupEntitled());
        return ApiResponse.ok(body);
    }

    private boolean isOverdue(BackupPolicy policy) {
        Instant lastSuccess = orchestrator.listRuns(tenantId()).stream()
                .filter(r -> policy.getId().equals(r.getPolicyId()))
                .filter(r -> BackupRun.STATUS_SUCCESS.equals(r.getStatus()))
                .map(BackupRun::getFinishedAt)
                .filter(java.util.Objects::nonNull)
                .max(Instant::compareTo)
                .orElse(null);
        return org.apache.datawise.backend.server.backup.BackupPolicyScheduler.isDue(
                policy,
                tenantId(),
                Instant.now(),
                lastSuccess
        );
    }

    private BackupPolicy preparePolicy(BackupPolicy request, boolean create) {
        BackupPolicy policy = request != null ? request : new BackupPolicy();
        if (create && (policy.getId() == null || policy.getId().isBlank())) {
            policy.setId(IdGenerator.shortId("pol-"));
            policy.setCreatedAt(Instant.now());
            policy.setCreatedBy(UserContext.getUserId());
        }
        policy.setUpdatedAt(Instant.now());
        if (policy.getEncryption() == null || policy.getEncryption().isBlank()) {
            policy.setEncryption("none");
        }
        if (!"none".equalsIgnoreCase(policy.getEncryption())) {
            throw new IllegalArgumentException("only encryption=none is supported");
        }
        return policy;
    }

    /**
     * Free-tier ad-hoc run: no cron schedule; retention capped to a single artifact.
     */
    private BackupPolicy sanitizeAdHocRun(BackupPolicy request) {
        BackupPolicy policy = preparePolicy(request, true);
        if (migrationAccessGate.isBackupEntitled()) {
            return policy;
        }
        policy.setCronExpression(null);
        policy.setEnabled(false);
        org.apache.datawise.backend.backup.model.BackupRetentionSpec retention =
                new org.apache.datawise.backend.backup.model.BackupRetentionSpec();
        retention.setMaxCount(1);
        retention.setMaxAgeDays(null);
        retention.setMaxTotalBytes(null);
        policy.setRetention(retention);
        return policy;
    }

    private void requireAdminOnly() {
        userAdminPolicy.requireAdminUser();
    }

    private void requireBackupAdmin() {
        userAdminPolicy.requireAdminUser();
        migrationAccessGate.requireBackupPack();
    }

    private String tenantId() {
        return orchestrator.resolveTenantId();
    }

    public record RestorePreflightRequest(
            String artifactId,
            String artifactPath,
            String targetConnectionId,
            String targetDatabase,
            boolean productionAck
    ) {
    }
}
