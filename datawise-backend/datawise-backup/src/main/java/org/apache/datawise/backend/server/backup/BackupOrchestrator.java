package org.apache.datawise.backend.server.backup;

import org.apache.datawise.backend.backup.BackupArtifactStore;
import org.apache.datawise.backend.backup.BackupPathSanitizer;
import org.apache.datawise.backend.backup.BackupPolicyStore;
import org.apache.datawise.backend.backup.BackupRetentionService;
import org.apache.datawise.backend.backup.BackupRunStore;
import org.apache.datawise.backend.backup.RestoreJobStore;
import org.apache.datawise.backend.backup.WorkbenchBackupService;
import org.apache.datawise.backend.backup.WorkbenchRestoreService;
import org.apache.datawise.backend.backup.model.BackupPolicy;
import org.apache.datawise.backend.backup.model.BackupProgress;
import org.apache.datawise.backend.backup.model.BackupRun;
import org.apache.datawise.backend.backup.model.RestoreJob;
import org.apache.datawise.backend.common.pack.BackupScheduleRunner;
import org.apache.datawise.backend.common.support.IdGenerator;
import org.apache.datawise.backend.config.BackupProperties;
import org.apache.datawise.backend.config.TenancyProperties;
import org.apache.datawise.backend.database.backup.DatabaseBackupService;
import org.apache.datawise.backend.database.backup.DatabaseRestoreService;
import org.apache.datawise.backend.domain.OutboundEventType;
import org.apache.datawise.backend.security.UserContext;
import org.apache.datawise.backend.service.outbound.OutboundNotifySupport;
import org.apache.datawise.backend.service.tenant.PlatformAdminPolicy;
import org.apache.datawise.taskconcurrency.api.TaskConcurrencyController;
import org.apache.datawise.taskconcurrency.runtime.TaskConcurrencyRuntime;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Service;

import java.nio.file.Path;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;

@Service
public class BackupOrchestrator implements BackupScheduleRunner {

    private static final Logger log = LoggerFactory.getLogger(BackupOrchestrator.class);

    private final BackupPolicyStore policyStore;
    private final BackupRunStore runStore;
    private final RestoreJobStore restoreJobStore;
    private final BackupArtifactStore artifactStore;
    private final BackupRetentionService retentionService;
    private final WorkbenchBackupService workbenchBackupService;
    private final WorkbenchRestoreService workbenchRestoreService;
    private final DatabaseBackupService databaseBackupService;
    private final DatabaseRestoreService databaseRestoreService;
    private final BackupProperties backupProperties;
    private final TenancyProperties tenancyProperties;
    private final PlatformAdminPolicy platformAdminPolicy;
    private final OutboundNotifySupport outboundNotifySupport;
    private final BackupTaskAdmissionService backupTaskAdmission;
    private final TaskConcurrencyController taskConcurrencyController;
    private final ObjectProvider<TaskConcurrencyRuntime> taskConcurrencyRuntime;
    /** Legacy fallback when task-concurrency runtime is unavailable. */
    private final ExecutorService backupJobTaskExecutor;

    private final ConcurrentHashMap<String, BackupRun> activeRuns = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, PendingRun> pendingRuns = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, PendingRestore> pendingRestores = new ConcurrentHashMap<>();

    public BackupOrchestrator(
            BackupPolicyStore policyStore,
            BackupRunStore runStore,
            RestoreJobStore restoreJobStore,
            BackupArtifactStore artifactStore,
            BackupRetentionService retentionService,
            WorkbenchBackupService workbenchBackupService,
            WorkbenchRestoreService workbenchRestoreService,
            DatabaseBackupService databaseBackupService,
            DatabaseRestoreService databaseRestoreService,
            BackupProperties backupProperties,
            TenancyProperties tenancyProperties,
            PlatformAdminPolicy platformAdminPolicy,
            OutboundNotifySupport outboundNotifySupport,
            BackupTaskAdmissionService backupTaskAdmission,
            ObjectProvider<TaskConcurrencyController> taskConcurrencyController,
            ObjectProvider<TaskConcurrencyRuntime> taskConcurrencyRuntime,
            @Qualifier("backupJobTaskExecutor") ExecutorService backupJobTaskExecutor
    ) {
        this.policyStore = policyStore;
        this.runStore = runStore;
        this.restoreJobStore = restoreJobStore;
        this.artifactStore = artifactStore;
        this.retentionService = retentionService;
        this.workbenchBackupService = workbenchBackupService;
        this.workbenchRestoreService = workbenchRestoreService;
        this.databaseBackupService = databaseBackupService;
        this.databaseRestoreService = databaseRestoreService;
        this.backupProperties = backupProperties;
        this.tenancyProperties = tenancyProperties;
        this.platformAdminPolicy = platformAdminPolicy;
        this.outboundNotifySupport = outboundNotifySupport;
        this.backupTaskAdmission = backupTaskAdmission;
        this.taskConcurrencyController = taskConcurrencyController.getIfAvailable();
        this.taskConcurrencyRuntime = taskConcurrencyRuntime;
        this.backupJobTaskExecutor = backupJobTaskExecutor;
    }

    public BackupRun runPolicy(String tenantId, String policyId, String trigger) {
        BackupPolicy policy = policyStore.findById(tenantId, policyId)
                .orElseThrow(() -> new IllegalArgumentException("policy not found: " + policyId));
        return startRun(tenantId, policy, trigger);
    }

    public BackupRun startAdHocRun(String tenantId, BackupPolicy spec, String trigger) {
        BackupPolicy policy = spec != null ? spec : new BackupPolicy();
        if (policy.getType() == null || policy.getType().isBlank()) {
            throw new IllegalArgumentException("type is required");
        }
        return startRun(tenantId, policy, trigger != null ? trigger : BackupRun.TRIGGER_API);
    }

    private BackupRun startRun(String tenantId, BackupPolicy policy, String trigger) {
        ensureDiskSpace(policy, tenantId);

        BackupRun run = new BackupRun();
        run.setId(IdGenerator.shortId("run-"));
        run.setPolicyId(policy.getId());
        run.setType(policy.getType());
        run.setTrigger(trigger != null ? trigger : BackupRun.TRIGGER_MANUAL);
        run.setCreatedByUserId(UserContext.getUserId());
        run.setTenantId(tenantId);
        run.setPolicySnapshot(policy);

        UserContext.Snapshot snapshot = UserContext.snapshotOrNull();
        PendingRun pending = new PendingRun(tenantId, policy, snapshot);
        pendingRuns.put(run.getId(), pending);
        activeRuns.put(run.getId(), run);

        if (useTaskConcurrencyPool()) {
            run.setStatus(BackupRun.STATUS_PENDING);
            run.setMessage("queued for task-concurrency slot");
            runStore.save(tenantId, run);
            backupTaskAdmission.enqueueBackupRun(tenantId, run.getId(), taskConcurrencyController);
            log.info("backup.run.queued runId={} tenantId={} type={}", run.getId(), tenantId, run.getType());
            return run;
        }

        run.setStatus(BackupRun.STATUS_RUNNING);
        run.setStartedAt(Instant.now());
        runStore.save(tenantId, run);
        log.info("backup.run.scheduled runId={} (legacy executor)", run.getId());
        backupJobTaskExecutor.submit(() -> UserContext.runAs(snapshot, () -> executeRun(tenantId, run, policy, null)));
        return run;
    }

    /**
     * Invoked by {@link BackupTaskHandler} after a concurrency slot is granted.
     */
    public void executeAdmittedRun(String runId, Runnable heartbeat) {
        PendingRun pending = pendingRuns.get(runId);
        String tenantId;
        BackupPolicy policy;
        UserContext.Snapshot snapshot;
        BackupRun run;

        if (pending != null) {
            tenantId = pending.tenantId();
            policy = pending.policy();
            snapshot = pending.snapshot();
            run = activeRuns.get(runId);
            if (run == null) {
                run = runStore.findById(tenantId, runId)
                        .orElseThrow(() -> new IllegalStateException("backup run not found: " + runId));
                activeRuns.put(runId, run);
            }
        } else {
            BackupRunStore.LocatedRun located = runStore.findByIdAnywhere(runId)
                    .orElseThrow(() -> new IllegalStateException("no pending backup context for runId=" + runId));
            tenantId = located.tenantId();
            run = located.run();
            policy = resolvePolicyForRun(tenantId, run);
            snapshot = snapshotFor(run.getCreatedByUserId(), tenantId);
            activeRuns.put(runId, run);
            pendingRuns.put(runId, new PendingRun(tenantId, policy, snapshot));
            log.info("backup.run.rehydrated runId={} tenantId={}", runId, tenantId);
        }

        // Always reload cancel flag from store to avoid stale in-memory race.
        BackupRun latest = runStore.findById(tenantId, runId).orElse(run);
        run.setCancelRequested(latest.isCancelRequested());
        if (run.isCancelRequested() || BackupRun.STATUS_CANCELLED.equals(latest.getStatus())) {
            run.setStatus(BackupRun.STATUS_CANCELLED);
            run.setMessage(run.getMessage() != null ? run.getMessage() : "cancelled before start");
            run.setFinishedAt(Instant.now());
            runStore.save(tenantId, run);
            pendingRuns.remove(runId);
            activeRuns.remove(runId);
            return;
        }
        run.setStatus(BackupRun.STATUS_RUNNING);
        if (run.getStartedAt() == null) {
            run.setStartedAt(Instant.now());
        }
        run.setMessage(null);
        runStore.save(tenantId, run);

        BackupRun live = run;
        BackupPolicy livePolicy = policy;
        String liveTenant = tenantId;
        UserContext.runAs(snapshot, () -> {
            pulse(heartbeat);
            executeRun(liveTenant, live, livePolicy, heartbeat);
            return null;
        });
    }

    private void executeRun(String tenantId, BackupRun run, BackupPolicy policy, Runnable heartbeat) {
        try {
            Path root = artifactStore.resolveRoot(tenantId, policy);
            java.util.function.Consumer<BackupProgress> progress = p -> {
                pulse(heartbeat);
                run.setProgress(p);
                // Refresh cancel flag from shared active/store map periodically.
                BackupRun active = activeRuns.get(run.getId());
                if (active != null && active.isCancelRequested()) {
                    run.setCancelRequested(true);
                }
                runStore.save(tenantId, run);
            };
            java.util.function.Supplier<Boolean> cancelCheck = () -> {
                BackupRun active = activeRuns.get(run.getId());
                return run.isCancelRequested() || (active != null && active.isCancelRequested());
            };

            if (BackupPolicy.TYPE_WORKBENCH.equals(policy.getType())) {
                WorkbenchBackupService.WorkbenchBackupResult result =
                        workbenchBackupService.backup(tenantId, run, policy, root, cancelCheck, progress);
                run.setArtifactPath(result.artifactDir().toString());
                run.setArtifactId(run.getId());
                run.setStatus(BackupRun.STATUS_SUCCESS);
            } else if (BackupPolicy.TYPE_DATABASE.equals(policy.getType())) {
                DatabaseBackupService.DatabaseBackupResult result =
                        databaseBackupService.backup(tenantId, run, policy, root, cancelCheck, progress);
                run.setArtifactPath(result.artifactDir().toString());
                run.setArtifactId(run.getId());
                String status = result.manifest() != null && result.manifest().getStatus() != null
                        ? result.manifest().getStatus()
                        : BackupRun.STATUS_SUCCESS;
                run.setStatus(status);
            } else {
                throw new IllegalArgumentException("unsupported backup type: " + policy.getType());
            }

            if (policy.getRetention() != null) {
                retentionService.enforceRetention(root, policy.getRetention(), policy.getType());
            }
            boolean ok = BackupRun.STATUS_SUCCESS.equals(run.getStatus())
                    || BackupRun.STATUS_PARTIAL.equals(run.getStatus());
            notifyBackup(run, policy, ok, BackupRun.STATUS_PARTIAL.equals(run.getStatus()) ? "partial" : "completed");
        } catch (WorkbenchBackupService.BackupCancelledException
                 | org.apache.datawise.backend.database.backup.StreamingSqlBackupWriter.BackupCancelledException ex) {
            run.setStatus(BackupRun.STATUS_CANCELLED);
            run.setMessage(ex.getMessage());
        } catch (Exception ex) {
            if (ex instanceof InterruptedException || ex.getCause() instanceof InterruptedException) {
                Thread.currentThread().interrupt();
            }
            run.setStatus(BackupRun.STATUS_FAILED);
            run.setMessage(ex.getMessage() != null ? ex.getMessage() : ex.getClass().getSimpleName());
            notifyBackup(run, policy, false, run.getMessage());
        } finally {
            run.setFinishedAt(Instant.now());
            runStore.save(tenantId, run);
            activeRuns.remove(run.getId());
            pendingRuns.remove(run.getId());
        }
    }

    public BackupRun getRun(String tenantId, String runId) {
        return runStore.findById(tenantId, runId)
                .orElseThrow(() -> new IllegalArgumentException("run not found: " + runId));
    }

    public List<BackupRun> listRuns(String tenantId) {
        return runStore.list(tenantId);
    }

    public BackupRun cancelRun(String tenantId, String runId) {
        BackupRun run = getRun(tenantId, runId);
        run.setCancelRequested(true);
        BackupRun active = activeRuns.get(runId);
        if (active != null) {
            active.setCancelRequested(true);
        }
        if (BackupRun.STATUS_PENDING.equals(run.getStatus())) {
            if (taskConcurrencyController != null) {
                try {
                    taskConcurrencyController.cancelPending(runId);
                } catch (RuntimeException ignored) {
                    // ignore
                }
                boolean stillDispatched = taskConcurrencyController.findLease(runId).isPresent();
                if (!stillDispatched) {
                    run.setStatus(BackupRun.STATUS_CANCELLED);
                    run.setMessage("cancelled while queued");
                    run.setFinishedAt(Instant.now());
                    pendingRuns.remove(runId);
                    activeRuns.remove(runId);
                }
            } else {
                run.setStatus(BackupRun.STATUS_CANCELLED);
                run.setMessage("cancelled while queued");
                run.setFinishedAt(Instant.now());
                pendingRuns.remove(runId);
                activeRuns.remove(runId);
            }
        }
        runStore.save(tenantId, run);
        return run;
    }

    public RestoreJob startRestore(String tenantId, RestoreJob request) throws Exception {
        Path artifactDir = resolveArtifactDir(tenantId, request.getArtifactId(), request.getArtifactPath());
        var manifest = artifactStore.readManifest(artifactDir);

        if (BackupPolicy.TYPE_WORKBENCH.equals(manifest.getType())) {
            if (RestoreJob.MODE_FULL.equals(request.getMode())) {
                platformAdminPolicy.requirePlatformAdmin();
            }
            BackupRun snapshot = startPreRestoreSnapshot(tenantId);
            if (!BackupRun.STATUS_SUCCESS.equals(snapshot.getStatus())) {
                throw new IllegalStateException("pre-restore snapshot failed: "
                        + (snapshot.getMessage() != null ? snapshot.getMessage() : snapshot.getStatus()));
            }
            request.setPreRestoreSnapshotId(snapshot.getId());
        }

        RestoreJob job = new RestoreJob();
        job.setId(IdGenerator.shortId("rst-"));
        job.setArtifactId(request.getArtifactId() != null ? request.getArtifactId() : manifest.getArtifactId());
        job.setArtifactPath(artifactDir.toString());
        job.setType(manifest.getType());
        job.setMode(request.getMode() != null ? request.getMode() : RestoreJob.MODE_FULL);
        job.setTargetConnectionId(request.getTargetConnectionId());
        job.setTargetDatabase(request.getTargetDatabase());
        job.setProductionAck(request.isProductionAck());
        job.setPreRestoreSnapshotId(request.getPreRestoreSnapshotId());
        job.setCreatedByUserId(UserContext.getUserId());
        job.setTenantId(tenantId);

        UserContext.Snapshot snapshot = UserContext.snapshotOrNull();
        Long userId = UserContext.getUserId();
        pendingRestores.put(job.getId(), new PendingRestore(tenantId, job, artifactDir, userId, snapshot));

        if (useTaskConcurrencyPool()) {
            job.setStatus(RestoreJob.STATUS_PENDING);
            job.setMessage("queued for task-concurrency slot");
            restoreJobStore.save(tenantId, job);
            backupTaskAdmission.enqueueRestore(tenantId, job.getId(), taskConcurrencyController);
            log.info("backup.restore.queued jobId={} tenantId={}", job.getId(), tenantId);
            return job;
        }

        job.setStatus(RestoreJob.STATUS_RUNNING);
        job.setStartedAt(Instant.now());
        restoreJobStore.save(tenantId, job);
        log.info("backup.restore.scheduled jobId={} (legacy executor)", job.getId());
        backupJobTaskExecutor.submit(() -> UserContext.runAs(snapshot, () -> executeRestore(tenantId, job, artifactDir, userId, null)));
        return job;
    }

    /**
     * Invoked by {@link BackupTaskHandler} after a concurrency slot is granted.
     */
    public void executeAdmittedRestore(String jobId, Runnable heartbeat) {
        PendingRestore pending = pendingRestores.get(jobId);
        String tenantId;
        RestoreJob job;
        Path artifactDir;
        Long userId;
        UserContext.Snapshot snapshot;

        if (pending != null) {
            tenantId = pending.tenantId();
            job = pending.job();
            artifactDir = pending.artifactDir();
            userId = pending.userId();
            snapshot = pending.snapshot();
        } else {
            RestoreJobStore.LocatedJob located = restoreJobStore.findByIdAnywhere(jobId)
                    .orElseThrow(() -> new IllegalStateException("no pending restore context for jobId=" + jobId));
            tenantId = located.tenantId();
            job = located.job();
            artifactDir = Path.of(job.getArtifactPath());
            userId = job.getCreatedByUserId();
            snapshot = snapshotFor(userId, tenantId);
            pendingRestores.put(jobId, new PendingRestore(tenantId, job, artifactDir, userId, snapshot));
            log.info("backup.restore.rehydrated jobId={} tenantId={}", jobId, tenantId);
        }

        RestoreJob latest = restoreJobStore.findById(tenantId, jobId).orElse(job);
        job.setCancelRequested(latest.isCancelRequested());
        if (job.isCancelRequested() || RestoreJob.STATUS_CANCELLED_PARTIAL.equals(latest.getStatus())
                || RestoreJob.STATUS_CANCELLED.equals(latest.getStatus())) {
            job.setStatus(RestoreJob.STATUS_CANCELLED_PARTIAL);
            job.setMessage(job.getMessage() != null ? job.getMessage() : "cancelled before start");
            job.setFinishedAt(Instant.now());
            restoreJobStore.save(tenantId, job);
            pendingRestores.remove(jobId);
            return;
        }
        job.setStatus(RestoreJob.STATUS_RUNNING);
        if (job.getStartedAt() == null) {
            job.setStartedAt(Instant.now());
        }
        job.setMessage(null);
        restoreJobStore.save(tenantId, job);

        String liveTenant = tenantId;
        Path liveDir = artifactDir;
        Long liveUser = userId;
        UserContext.runAs(snapshot, () -> {
            pulse(heartbeat);
            executeRestore(liveTenant, job, liveDir, liveUser, heartbeat);
            return null;
        });
    }

    private void executeRestore(String tenantId, RestoreJob job, Path artifactDir, Long userId, Runnable heartbeat) {
        try {
            java.util.function.Consumer<BackupProgress> progress = p -> {
                pulse(heartbeat);
                job.setProgress(p);
                restoreJobStore.save(tenantId, job);
            };
            if (BackupPolicy.TYPE_WORKBENCH.equals(job.getType())) {
                workbenchRestoreService.restore(artifactDir, job, progress);
            } else if (BackupPolicy.TYPE_DATABASE.equals(job.getType())) {
                databaseRestoreService.restore(
                        artifactDir,
                        job,
                        userId != null ? userId : 0L,
                        job::isCancelRequested,
                        progress
                );
            } else {
                throw new IllegalArgumentException("unsupported restore type: " + job.getType());
            }
            job.setStatus(RestoreJob.STATUS_SUCCESS);
            job.setMessage("restore completed");
        } catch (DatabaseRestoreService.RestoreCancelledException ex) {
            job.setStatus(RestoreJob.STATUS_CANCELLED_PARTIAL);
            job.setMessage(ex.getMessage());
        } catch (Exception ex) {
            job.setStatus(RestoreJob.STATUS_FAILED);
            job.setMessage(ex.getMessage() != null ? ex.getMessage() : ex.getClass().getSimpleName());
        } finally {
            job.setFinishedAt(Instant.now());
            restoreJobStore.save(tenantId, job);
            pendingRestores.remove(job.getId());
        }
    }

    public RestoreJob getRestoreJob(String tenantId, String jobId) {
        return restoreJobStore.findById(tenantId, jobId)
                .orElseThrow(() -> new IllegalArgumentException("restore job not found: " + jobId));
    }

    public RestoreJob cancelRestoreJob(String tenantId, String jobId) {
        RestoreJob job = getRestoreJob(tenantId, jobId);
        job.setCancelRequested(true);
        PendingRestore pending = pendingRestores.get(jobId);
        if (pending != null) {
            pending.job().setCancelRequested(true);
        }
        if (RestoreJob.STATUS_PENDING.equals(job.getStatus())) {
            if (taskConcurrencyController != null) {
                try {
                    taskConcurrencyController.cancelPending(jobId);
                } catch (RuntimeException ignored) {
                    // ignore
                }
                boolean stillDispatched = taskConcurrencyController.findLease(jobId).isPresent();
                if (!stillDispatched) {
                    job.setStatus(RestoreJob.STATUS_CANCELLED_PARTIAL);
                    job.setMessage("cancelled while queued");
                    job.setFinishedAt(Instant.now());
                    pendingRestores.remove(jobId);
                }
            } else {
                job.setStatus(RestoreJob.STATUS_CANCELLED_PARTIAL);
                job.setMessage("cancelled while queued");
                job.setFinishedAt(Instant.now());
                pendingRestores.remove(jobId);
            }
        }
        restoreJobStore.save(tenantId, job);
        return job;
    }

    public DatabaseRestoreService.DatabaseRestorePreflight preflightRestore(
            String tenantId,
            String artifactId,
            String artifactPath,
            String targetConnectionId,
            String targetDatabase,
            boolean productionAck
    ) throws Exception {
        Path artifactDir = resolveArtifactDir(tenantId, artifactId, artifactPath);
        long userId = UserContext.requireUserId();
        return databaseRestoreService.preflight(
                artifactDir,
                targetConnectionId,
                targetDatabase,
                productionAck,
                userId
        );
    }

    private boolean useTaskConcurrencyPool() {
        if (taskConcurrencyController == null) {
            return false;
        }
        TaskConcurrencyRuntime runtime = taskConcurrencyRuntime.getIfAvailable();
        boolean started = runtime != null && runtime.isStarted();
        if (!started) {
            log.warn(
                    "backup.task-concurrency.unavailable runtimePresent={} started={} — falling back to legacy executor",
                    runtime != null,
                    started
            );
        }
        return started;
    }

    private BackupRun startPreRestoreSnapshot(String tenantId) {
        BackupPolicy snapshotPolicy = new BackupPolicy();
        snapshotPolicy.setType(BackupPolicy.TYPE_WORKBENCH);
        snapshotPolicy.setName("pre-restore snapshot");
        BackupRun run = new BackupRun();
        run.setId(IdGenerator.shortId("run-"));
        run.setType(BackupPolicy.TYPE_WORKBENCH);
        run.setTrigger(BackupRun.TRIGGER_PRE_RESTORE);
        run.setStatus(BackupRun.STATUS_RUNNING);
        run.setStartedAt(Instant.now());
        run.setCreatedByUserId(UserContext.getUserId());
        run.setTenantId(tenantId);
        runStore.save(tenantId, run);
        try {
            Path root = artifactStore.resolveRoot(tenantId, snapshotPolicy);
            var result = workbenchBackupService.backup(
                    tenantId,
                    run,
                    snapshotPolicy,
                    root,
                    () -> false,
                    p -> {
                    }
            );
            run.setArtifactPath(result.artifactDir().toString());
            run.setArtifactId(run.getId());
            run.setStatus(BackupRun.STATUS_SUCCESS);
        } catch (Exception ex) {
            run.setStatus(BackupRun.STATUS_FAILED);
            run.setMessage(ex.getMessage());
        } finally {
            run.setFinishedAt(Instant.now());
            runStore.save(tenantId, run);
        }
        return run;
    }

    private Path resolveArtifactDir(String tenantId, String artifactId, String artifactPath) throws java.io.IOException {
        Path root = artifactStore.resolveRoot(tenantId, (BackupPolicy) null);
        if (artifactPath != null && !artifactPath.isBlank()) {
            Path resolved = Path.of(artifactPath.trim()).toAbsolutePath().normalize();
            BackupPathSanitizer.rejectEscape(resolved);
            if (!resolved.startsWith(root)) {
                throw new IllegalArgumentException("artifact path escapes backup root: " + resolved);
            }
            return resolved;
        }
        Optional<Path> dir = artifactStore.findArtifactDir(root, artifactId);
        return dir.orElseThrow(() -> new IllegalArgumentException("artifact not found: " + artifactId));
    }

    private void ensureDiskSpace(BackupPolicy policy, String tenantId) {
        try {
            Path root = artifactStore.resolveRoot(tenantId, policy);
            long free = artifactStore.freeBytes(root);
            if (free < backupProperties.getDiskMinFreeBytes()) {
                throw new IllegalArgumentException("insufficient disk space for backup");
            }
        } catch (java.io.IOException ex) {
            throw new IllegalArgumentException("unable to check disk space: " + ex.getMessage());
        }
    }

    private void notifyBackup(BackupRun run, BackupPolicy policy, boolean ok, String message) {
        Long userId = run.getCreatedByUserId();
        if (userId == null) {
            return;
        }
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("name", policy != null && policy.getName() != null ? policy.getName() : run.getType());
        data.put("type", run.getType());
        data.put("message", message != null ? message : "");
        data.put("runId", run.getId());
        data.put("artifactId", run.getArtifactId());
        boolean notify = ok ? policy == null || policy.isNotifyOnSuccess() : policy == null || policy.isNotifyOnFailure();
        if (!notify) {
            return;
        }
        outboundNotifySupport.publish(
                ok ? OutboundEventType.BACKUP_OK : OutboundEventType.BACKUP_FAILED,
                data,
                userId
        );
    }

    private BackupPolicy resolvePolicyForRun(String tenantId, BackupRun run) {
        if (run.getPolicySnapshot() != null) {
            return run.getPolicySnapshot();
        }
        if (run.getPolicyId() != null && !run.getPolicyId().isBlank()) {
            return policyStore.findById(tenantId, run.getPolicyId())
                    .orElseThrow(() -> new IllegalStateException("policy not found for run: " + run.getId()));
        }
        throw new IllegalStateException("cannot rehydrate policy for run: " + run.getId());
    }

    private static UserContext.Snapshot snapshotFor(Long userId, String tenantId) {
        return new UserContext.Snapshot(
                userId != null ? userId : 1L,
                false,
                "backup-rehydrate",
                null,
                tenantId
        );
    }

    private static void pulse(Runnable heartbeat) {
        if (heartbeat != null) {
            heartbeat.run();
        }
    }

    @Override
    public String runScheduledPolicy(String policyId) throws Exception {
        String tenantId = resolveTenantId();
        BackupRun run = runPolicy(tenantId, policyId, BackupRun.TRIGGER_SCHEDULE);
        return "backup run started: " + run.getId() + " status=" + run.getStatus();
    }

    public String resolveTenantId() {
        String fromContext = UserContext.getTenantId();
        if (fromContext != null && !fromContext.isBlank()) {
            return fromContext;
        }
        return tenancyProperties.getDefaultTenantId();
    }

    private record PendingRun(String tenantId, BackupPolicy policy, UserContext.Snapshot snapshot) {
    }

    private record PendingRestore(
            String tenantId,
            RestoreJob job,
            Path artifactDir,
            Long userId,
            UserContext.Snapshot snapshot
    ) {
    }
}
