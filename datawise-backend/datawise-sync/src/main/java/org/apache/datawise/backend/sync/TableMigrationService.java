package org.apache.datawise.backend.sync;

import org.apache.datawise.backend.config.TableMigrationProperties;
import org.apache.datawise.backend.common.support.ExceptionLogging;
import org.apache.datawise.backend.configstore.migration.MigrationJobEntity;
import org.apache.datawise.backend.database.context.ConnectionExecutionContext;
import org.apache.datawise.backend.sync.api.MigrationExecutionControl;
import org.apache.datawise.backend.sync.api.MigrationCancelledException;
import org.apache.datawise.backend.sync.api.MigrationPausedException;
import org.apache.datawise.backend.sync.api.TableMigrationProgressListener;
import org.apache.datawise.backend.sync.engine.MigrationEndpoints;
import org.apache.datawise.backend.sync.engine.TableMigrationBatchRequestPolicy;
import org.apache.datawise.backend.sync.engine.TableMigrationBatchPlan;
import org.apache.datawise.backend.sync.engine.MigrationExecutorProvider;
import org.apache.datawise.backend.sync.engine.MigrationExecutorRegistry;
import org.apache.datawise.backend.sync.engine.TableMigrationJobHooks;
import org.apache.datawise.backend.sync.engine.TableMigrationRequestPolicy;
import org.apache.datawise.backend.sync.job.MigrationJobCoordinator;
import org.apache.datawise.backend.sync.job.MigrationJobRuntime;
import org.apache.datawise.backend.sync.job.MigrationTaskAdmissionService;
import org.apache.datawise.backend.sync.stream.MigrationJobStreamHub;
import org.apache.datawise.backend.sync.stream.TableMigrationStreamEmitter;
import org.apache.datawise.backend.sync.support.MigrationSupport;
import org.apache.datawise.backend.security.UserContext;
import org.apache.datawise.backend.service.ConnectionAccessService;
import org.apache.datawise.backend.service.UserAccountService;
import org.apache.datawise.backend.service.outbound.OutboundEventSignals;
import org.apache.datawise.taskconcurrency.api.TaskConcurrencyController;
import org.apache.datawise.taskconcurrency.runtime.TaskConcurrencyRuntime;

import org.apache.datawise.backend.domain.MigrationJobView;
import org.apache.datawise.backend.domain.TableMigrationBatchRequest;
import org.apache.datawise.backend.domain.TableMigrationBatchResult;
import org.apache.datawise.backend.domain.TableMigrationRequest;
import org.apache.datawise.backend.domain.TableMigrationResult;
import org.apache.datawise.backend.model.ConnectionEntity;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;
import org.springframework.beans.factory.annotation.Value;

import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.Executor;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Qualifier;

/** 表迁移门面：校验上下文后委托 {@link MigrationExecutorRegistry} 解析的执行器。 */
@Service
public class TableMigrationService {

    private static final Logger log = LoggerFactory.getLogger(TableMigrationService.class);

    private final ConnectionExecutionContext connectionContext;
    private final UserAccountService userAccountService;
    private final ConnectionAccessService connectionAccessService;
    private final MigrationExecutorRegistry migrationExecutorRegistry;
    private final MigrationJobCoordinator jobCoordinator;
    private final MigrationJobRuntime jobRuntime;
    private final MigrationJobStreamHub jobStreamHub;
    private final TableMigrationProperties migrationProperties;
    private final Executor migrationJobTaskExecutor;
    private final TaskConcurrencyController taskConcurrencyController;
    private final ObjectProvider<TaskConcurrencyRuntime> taskConcurrencyRuntime;
    private final MigrationTaskAdmissionService migrationTaskAdmission;
    private final OutboundEventSignals outboundEventSignals;
    private final boolean taskConcurrencyEnabled;

    public TableMigrationService(
            ConnectionExecutionContext connectionContext,
            UserAccountService userAccountService,
            ConnectionAccessService connectionAccessService,
            MigrationExecutorRegistry migrationExecutorRegistry,
            MigrationJobCoordinator jobCoordinator,
            MigrationJobRuntime jobRuntime,
            MigrationJobStreamHub jobStreamHub,
            TableMigrationProperties migrationProperties,
            @Qualifier("migrationJobTaskExecutor") Executor migrationJobTaskExecutor,
            ObjectProvider<TaskConcurrencyController> taskConcurrencyController,
            ObjectProvider<TaskConcurrencyRuntime> taskConcurrencyRuntime,
            MigrationTaskAdmissionService migrationTaskAdmission,
            OutboundEventSignals outboundEventSignals,
            @Value("${datawise.migration.task-concurrency-enabled:true}") boolean taskConcurrencyEnabled
    ) {
        this.connectionContext = connectionContext;
        this.userAccountService = userAccountService;
        this.connectionAccessService = connectionAccessService;
        this.migrationExecutorRegistry = migrationExecutorRegistry;
        this.jobCoordinator = jobCoordinator;
        this.jobRuntime = jobRuntime;
        this.jobStreamHub = jobStreamHub;
        this.migrationProperties = migrationProperties != null ? migrationProperties : new TableMigrationProperties();
        this.migrationJobTaskExecutor = migrationJobTaskExecutor != null ? migrationJobTaskExecutor : runnable -> runnable.run();
        this.taskConcurrencyController = taskConcurrencyController.getIfAvailable();
        this.taskConcurrencyRuntime = taskConcurrencyRuntime;
        this.migrationTaskAdmission = migrationTaskAdmission;
        this.outboundEventSignals = outboundEventSignals;
        this.taskConcurrencyEnabled = taskConcurrencyEnabled;
    }

    public TableMigrationResult migrateTable(TableMigrationRequest request) {
        TableMigrationRequestPolicy.validate(request);

        long userId = userAccountService.requireUserId();
        ConnectionEntity source = MigrationSupport.requireConnection(
                connectionContext,
                userId,
                request.sourceConnectionId()
        );
        ConnectionEntity target = MigrationSupport.requireConnection(
                connectionContext,
                userId,
                request.targetConnectionId()
        );
        connectionAccessService.requireWriteAccess(userId, request.targetConnectionId());

        String sourceDatabase = MigrationSupport.requireDatabase(source, request.sourceDatabase());
        String targetDatabase = MigrationSupport.requireDatabase(target, request.targetDatabase());
        MigrationSupport.requireDistinctScopes(
                request.sourceConnectionId(),
                sourceDatabase,
                request.targetConnectionId(),
                targetDatabase
        );

        return migrationExecutor().migrate(source, target, sourceDatabase, targetDatabase, request);
    }

    public TableMigrationBatchResult migrateTables(TableMigrationBatchRequest request) {
        return executeBatchMigration(request, null, MigrationExecutionControl.noop());
    }

    public TableMigrationBatchResult migrateTablesStream(
            TableMigrationBatchRequest request,
            TableMigrationProgressListener progressListener
    ) {
        return executeBatchMigration(request, progressListener, MigrationExecutionControl.noop());
    }

    public MigrationJobView getJob(String jobId) {
        long userId = userAccountService.requireUserId();
        MigrationJobView view = jobCoordinator.viewFor(userId, jobId);
        // JVM 重启后磁盘仍可能是 running，但运行时已无任务：校正为 paused 以便 UI 续传
        // queued 任务尚未进入 runtime，不能按此规则回收。
        if ("running".equals(view.status()) && !jobRuntime.isRunning(jobId)) {
            MigrationJobEntity job = jobCoordinator.requireOwnedJob(userId, jobId);
            jobCoordinator.markJobPaused(job);
            return jobCoordinator.viewFor(userId, jobId);
        }
        return view;
    }

    public List<MigrationJobView> listJobs() {
        long userId = userAccountService.requireUserId();
        List<MigrationJobView> views = jobCoordinator.listViewsForUser(userId);
        List<MigrationJobView> reconciled = new java.util.ArrayList<>(views.size());
        for (MigrationJobView view : views) {
            if ("running".equals(view.status()) && !jobRuntime.isRunning(view.id())) {
                MigrationJobEntity job = jobCoordinator.requireOwnedJob(userId, view.id());
                jobCoordinator.markJobPaused(job);
                reconciled.add(jobCoordinator.viewFor(userId, view.id()));
            } else {
                reconciled.add(view);
            }
        }
        return reconciled;
    }

    public void openJobStream(String jobId, SseEmitter emitter) {
        long userId = userAccountService.requireUserId();
        MigrationJobView view = jobCoordinator.viewFor(userId, jobId);
        TableMigrationStreamEmitter.sendJobSnapshot(emitter, view);
        if (TableMigrationStreamEmitter.isTerminalJobStatus(view.status())) {
            TableMigrationStreamEmitter.sendTerminalJobEvent(emitter, view);
            TableMigrationStreamEmitter.completeSuccess(emitter);
            return;
        }
        jobStreamHub.subscribe(jobId, emitter);
    }

    public MigrationJobView startJobAsync(TableMigrationBatchRequest request) {
        long userId = userAccountService.requireUserId();
        validateBatchRequest(request);
        MigrationJobCoordinator.ExecutionContext execution = jobCoordinator.prepare(userId, request);
        String jobId = execution.jobId();

        if (useTaskConcurrencyPool()) {
            // Defer runtime registration until a worker actually starts — otherwise pause/cancel
            // cannot finalize a job that is only waiting for a concurrency slot.
            jobCoordinator.markJobQueued(execution.job());
            migrationTaskAdmission.enqueue(
                    userId,
                    org.apache.datawise.backend.security.UserContext.getTenantId(),
                    jobId,
                    request,
                    taskConcurrencyController
            );
            log.info(
                    "migration.job.queued jobId={} userId={} tables={} mode={}",
                    jobId,
                    userId,
                    request.tables() != null ? request.tables().size() : 0,
                    request.mode()
            );
            MigrationJobView view = jobCoordinator.viewFor(userId, jobId);
            jobStreamHub.publishSnapshot(jobId, view);
            return view;
        }

        if (!jobRuntime.tryRegisterRunning(jobId)) {
            throw new IllegalStateException("Migration job already running: " + jobId);
        }
        jobCoordinator.markJobRunning(execution.job());
        log.info("migration.job.scheduled jobId={} userId={} (legacy executor)", jobId, userId);
        UserContext.Snapshot snapshot = UserContext.snapshotOrNull();
        CompletableFuture.runAsync(() -> UserContext.runAs(snapshot, () -> {
            try {
                executeRunningJob(jobId, null);
            } catch (MigrationPausedException ex) {
                // Already finalized + SSE published inside executeRunningJob.
            } catch (RuntimeException ex) {
                // Already ExceptionLogging.error + finalized inside executeRunningJob.
            } finally {
                jobRuntime.unregister(jobId);
            }
            return null;
        }), migrationJobTaskExecutor);
        return jobCoordinator.viewFor(userId, jobId);
    }

    /**
     * Executes a prepared migration job (used by task-concurrency handler and legacy async executor).
     */
    public void executeRunningJob(String jobId, Runnable heartbeat) {
        MigrationJobEntity job = jobCoordinator.findJob(jobId)
                .orElseThrow(() -> new IllegalStateException("Migration job not found: " + jobId));
        long userId = job.getUserId();
        TableMigrationBatchRequest request = job.getRequest();
        if (request == null) {
            throw new IllegalStateException("Migration job request snapshot missing: " + jobId);
        }
        // Honour pause/cancel that arrived while the job was still queued.
        if (jobRuntime.isCancelRequested(jobId)
                || "cancelled".equals(job.getStatus())) {
            jobCoordinator.markJobCancelled(job);
            MigrationJobView view = jobCoordinator.viewFor(userId, jobId);
            jobStreamHub.publishDone(jobId, view);
            throw new MigrationCancelledException(jobId);
        }
        if (jobRuntime.isPauseRequested(jobId)
                || "paused".equals(job.getStatus())) {
            jobCoordinator.markJobPaused(job);
            MigrationJobView view = jobCoordinator.viewFor(userId, jobId);
            jobStreamHub.publishPaused(jobId, view);
            throw new MigrationPausedException(jobId);
        }
        if (!jobRuntime.isRunning(jobId) && !jobRuntime.tryRegisterRunning(jobId)) {
            throw new IllegalStateException("Migration job already running: " + jobId);
        }
        // Legacy path may have registered already; still mark executing.
        if (!"running".equals(job.getStatus())) {
            jobCoordinator.markJobRunning(job);
        }
        log.info("migration.job.execute.start jobId={} userId={} tables={}",
                jobId, userId, request.tables() != null ? request.tables().size() : 0);
        UserContext.Snapshot snapshot = new UserContext.Snapshot(userId, false, null);
        MigrationJobCoordinator.ExecutionContext execution = jobCoordinator.executionContextFor(job);
        TableMigrationProgressListener streamListener = wrapHeartbeat(
                jobStreamHub.progressListener(jobId, () -> jobCoordinator.viewFor(userId, jobId)),
                heartbeat
        );
        UserContext.runAs(snapshot, () -> {
            jobRuntime.bindWorkerThread(jobId);
            jobStreamHub.publishSnapshot(jobId, jobCoordinator.viewFor(userId, jobId));
            try {
                executePreparedBatch(execution, request, streamListener, jobRuntime.controlFor(jobId));
                MigrationJobView view = jobCoordinator.viewFor(userId, jobId);
                log.info("migration.job.execute.done jobId={} status={}", jobId, view.status());
                jobStreamHub.publishDone(jobId, view);
            } catch (MigrationCancelledException ex) {
                flushCheckpoint(execution);
                jobCoordinator.markJobCancelled(execution.job());
                MigrationJobView view = jobCoordinator.viewFor(userId, jobId);
                log.info("migration.job.execute.cancelled jobId={}", jobId);
                jobStreamHub.publishDone(jobId, view);
                throw ex;
            } catch (MigrationPausedException ex) {
                flushCheckpoint(execution);
                jobCoordinator.markJobPaused(execution.job());
                MigrationJobView view = jobCoordinator.viewFor(userId, jobId);
                log.info("migration.job.execute.paused jobId={}", jobId);
                jobStreamHub.publishPaused(jobId, view);
                throw ex;
            } catch (RuntimeException ex) {
                ExceptionLogging.error(log, "migration.job.failed jobId=" + jobId, ex);
                flushCheckpoint(execution);
                jobCoordinator.finalizeJobAfterFailure(execution.job(), ex);
                notifyMigrationFailure(execution.job(), ex.getMessage());
                MigrationJobView view = jobCoordinator.viewFor(userId, jobId);
                jobStreamHub.publishDone(jobId, view);
                throw ex;
            } finally {
                jobRuntime.unregister(jobId);
            }
            return null;
        });
    }

    private boolean useTaskConcurrencyPool() {
        if (!taskConcurrencyEnabled || taskConcurrencyController == null) {
            return false;
        }
        TaskConcurrencyRuntime runtime = taskConcurrencyRuntime.getIfAvailable();
        if (runtime == null || !runtime.isStarted()) {
            log.warn(
                    "migration.task-concurrency.unavailable runtimePresent={} started={} — falling back to legacy executor",
                    runtime != null,
                    runtime != null && runtime.isStarted()
            );
            return false;
        }
        return true;
    }

    private static TableMigrationProgressListener wrapHeartbeat(
            TableMigrationProgressListener delegate,
            Runnable heartbeat
    ) {
        if (delegate == null || heartbeat == null) {
            return delegate;
        }
        return new TableMigrationProgressListener() {
            @Override
            public void onTableStart(int tableIndex, int tableTotal, String tableName) {
                safeHeartbeat(heartbeat);
                delegate.onTableStart(tableIndex, tableTotal, tableName);
            }

            @Override
            public void onTableResult(int tableIndex, int tableTotal, TableMigrationResult result) {
                safeHeartbeat(heartbeat);
                delegate.onTableResult(tableIndex, tableTotal, result);
            }

            @Override
            public void onBatchProgress(
                    int tableIndex,
                    int tableTotal,
                    String tableName,
                    long offset,
                    long rowsMigrated,
                    int batches
            ) {
                safeHeartbeat(heartbeat);
                delegate.onBatchProgress(tableIndex, tableTotal, tableName, offset, rowsMigrated, batches);
            }

            @Override
            public void onTablePhase(int tableIndex, int tableTotal, String tableName, String phase) {
                safeHeartbeat(heartbeat);
                delegate.onTablePhase(tableIndex, tableTotal, tableName, phase);
            }
        };
    }

    /** Heartbeat must not fail the migration (lease refresh is best-effort). */
    private static void safeHeartbeat(Runnable heartbeat) {
        try {
            heartbeat.run();
        } catch (RuntimeException ex) {
            ExceptionLogging.warn(log, "migration.heartbeat.failed", ex);
        }
    }

    public MigrationJobView pauseJob(String jobId) {
        long userId = userAccountService.requireUserId();
        MigrationJobEntity job = jobCoordinator.requireOwnedJob(userId, jobId);
        String status = job.getStatus();
        if (!"running".equals(status) && !"queued".equals(status)) {
            return jobCoordinator.viewFor(userId, jobId);
        }
        jobRuntime.requestPause(jobId);
        log.info("migration.job.pause.requested jobId={} status={} hasWorker={}",
                jobId, status, jobRuntime.hasBoundWorker(jobId));

        // Queued jobs never entered a worker — finalize immediately and drop the pool entry.
        if ("queued".equals(status)) {
            cancelQueuedTask(jobId);
            jobCoordinator.markJobPaused(job);
            MigrationJobView view = jobCoordinator.viewFor(userId, jobId);
            jobStreamHub.publishPaused(jobId, view);
            return view;
        }
        // Orphaned "running" with no runtime registration (e.g. JVM restart).
        if (!jobRuntime.isRunning(jobId)) {
            jobCoordinator.markJobPaused(job);
            MigrationJobView view = jobCoordinator.viewFor(userId, jobId);
            jobStreamHub.publishPaused(jobId, view);
            return view;
        }
        // Worker not bound yet (legacy scheduler lag): keep pause flag for the worker to observe.
        MigrationJobView view = jobCoordinator.viewFor(userId, jobId);
        jobStreamHub.publishSnapshot(jobId, view);
        return view;
    }

    public MigrationJobView cancelJob(String jobId) {
        long userId = userAccountService.requireUserId();
        MigrationJobEntity job = jobCoordinator.requireOwnedJob(userId, jobId);
        String status = job.getStatus();
        if ("paused".equals(status)) {
            jobCoordinator.markJobCancelled(job);
            MigrationJobView view = jobCoordinator.viewFor(userId, jobId);
            jobStreamHub.publishDone(jobId, view);
            return view;
        }
        if (!"running".equals(status) && !"queued".equals(status)) {
            return jobCoordinator.viewFor(userId, jobId);
        }
        jobRuntime.requestCancel(jobId);
        log.info("migration.job.cancel.requested jobId={} status={} hasWorker={}",
                jobId, status, jobRuntime.hasBoundWorker(jobId));

        if ("queued".equals(status)) {
            cancelQueuedTask(jobId);
            jobCoordinator.markJobCancelled(job);
            MigrationJobView view = jobCoordinator.viewFor(userId, jobId);
            jobStreamHub.publishDone(jobId, view);
            return view;
        }
        if (!jobRuntime.isRunning(jobId)) {
            jobCoordinator.markJobCancelled(job);
            MigrationJobView view = jobCoordinator.viewFor(userId, jobId);
            jobStreamHub.publishDone(jobId, view);
            return view;
        }
        MigrationJobView view = jobCoordinator.viewFor(userId, jobId);
        jobStreamHub.publishSnapshot(jobId, view);
        return view;
    }

    private void cancelQueuedTask(String jobId) {
        if (taskConcurrencyController == null || jobId == null || jobId.isBlank()) {
            return;
        }
        try {
            taskConcurrencyController.cancelPending(jobId);
        } catch (RuntimeException ex) {
            ExceptionLogging.recoverable(log, "migration.job.cancelPending failed jobId=" + jobId, ex);
        }
    }

    public MigrationJobView resumeJobAsync(String jobId) {
        long userId = userAccountService.requireUserId();
        MigrationJobEntity job = jobCoordinator.requireOwnedJob(userId, jobId);
        TableMigrationBatchRequest stored = job.getRequest();
        if (stored == null) {
            throw new IllegalArgumentException("Migration job request snapshot missing");
        }
        TableMigrationBatchRequest resumeRequest = new TableMigrationBatchRequest(
                stored.sourceConnectionId(),
                stored.sourceDatabase(),
                stored.targetConnectionId(),
                stored.targetDatabase(),
                stored.tables(),
                stored.mode(),
                stored.watermarkColumn(),
                stored.orderByColumns(),
                stored.whereClause(),
                stored.batchSize(),
                stored.throttleMs(),
                stored.truncateTarget(),
                jobId,
                jobId,
                stored.conflictStrategy(),
                stored.maxRows()
        );
        return startJobAsync(resumeRequest);
    }

    private TableMigrationBatchResult executeBatchMigration(
            TableMigrationBatchRequest request,
            TableMigrationProgressListener progressListener,
            MigrationExecutionControl unusedControl
    ) {
        long userId = userAccountService.requireUserId();
        validateBatchRequest(request);
        MigrationJobCoordinator.ExecutionContext execution = jobCoordinator.prepare(userId, request);
        if (!jobRuntime.tryRegisterRunning(execution.jobId())) {
            throw new IllegalStateException("Migration job already running: " + execution.jobId());
        }
        MigrationExecutionControl executionControl = jobRuntime.controlFor(execution.jobId());
        try {
            jobRuntime.bindWorkerThread(execution.jobId());
            return executePreparedBatch(execution, request, progressListener, executionControl);
        } catch (MigrationCancelledException ex) {
            flushCheckpoint(execution);
            jobCoordinator.markJobCancelled(execution.job());
            throw ex;
        } catch (MigrationPausedException ex) {
            flushCheckpoint(execution);
            jobCoordinator.markJobPaused(execution.job());
            throw ex;
        } catch (RuntimeException ex) {
            ExceptionLogging.error(log, "migration.job.failed jobId=" + execution.jobId(), ex);
            flushCheckpoint(execution);
            jobCoordinator.finalizeJobAfterFailure(execution.job(), ex);
            throw ex;
        } finally {
            jobRuntime.unregister(execution.jobId());
        }
    }

    private void flushCheckpoint(MigrationJobCoordinator.ExecutionContext execution) {
        if (execution != null && execution.sink() != null) {
            execution.sink().flush();
        }
    }

    private TableMigrationBatchResult executePreparedBatch(
            MigrationJobCoordinator.ExecutionContext execution,
            TableMigrationBatchRequest request,
            TableMigrationProgressListener progressListener,
            MigrationExecutionControl executionControl
    ) {
        long userId = userAccountService.requireUserId();
        ConnectionEntity source = MigrationSupport.requireConnection(
                connectionContext,
                userId,
                request.sourceConnectionId()
        );
        ConnectionEntity target = MigrationSupport.requireConnection(
                connectionContext,
                userId,
                request.targetConnectionId()
        );
        connectionAccessService.requireWriteAccess(userId, request.targetConnectionId());

        String sourceDatabase = MigrationSupport.requireDatabase(source, request.sourceDatabase());
        String targetDatabase = MigrationSupport.requireDatabase(target, request.targetDatabase());
        MigrationSupport.requireDistinctScopes(
                request.sourceConnectionId(),
                sourceDatabase,
                request.targetConnectionId(),
                targetDatabase
        );

        MigrationEndpoints endpoints = new MigrationEndpoints(source, target, sourceDatabase, targetDatabase);
        TableMigrationBatchPlan plan = TableMigrationBatchPlan.from(request, migrationProperties.getDefaultBatchSize());
        TableMigrationJobHooks hooks = new TableMigrationJobHooks(
                progressListener,
                execution.sink(),
                executionControl,
                false
        );
        List<TableMigrationResult> results = migrationExecutor().migrateBatch(endpoints, plan, hooks);
        jobCoordinator.finalizeJob(execution.job(), results);
        notifyMigrationCompletion(execution.job(), request, results);
        return new TableMigrationBatchResult(execution.jobId(), results);
    }

    private void validateBatchRequest(TableMigrationBatchRequest request) {
        TableMigrationBatchRequestPolicy.validate(request, migrationProperties.getMaxBatchTables());
    }

    private void notifyMigrationCompletion(
            MigrationJobEntity job,
            TableMigrationBatchRequest request,
            List<TableMigrationResult> results
    ) {
        if (job == null) {
            return;
        }
        List<TableMigrationResult> safeResults = results != null ? results : List.of();
        // Table results use "success"/"failed" (see MigrationExecutorProvider); job status uses "completed".
        boolean failed = safeResults.stream()
                .anyMatch(item -> item != null && !"success".equalsIgnoreCase(item.status()));
        if (failed) {
            String message = safeResults.stream()
                    .filter(item -> item != null && !"success".equalsIgnoreCase(item.status()))
                    .map(TableMigrationResult::message)
                    .filter(msg -> msg != null && !msg.isBlank())
                    .findFirst()
                    .orElse("Migration job has failed tables");
            notifyMigrationFailed(job, request, message);
            return;
        }
        notifyMigrationCompleted(job, request);
    }

    private void notifyMigrationFailure(MigrationJobEntity job, String message) {
        if (job == null) {
            return;
        }
        notifyMigrationFailed(job, job.getRequest(), message != null ? message : "");
    }

    private void notifyMigrationCompleted(MigrationJobEntity job, TableMigrationBatchRequest request) {
        if (job == null || job.getUserId() <= 0) {
            return;
        }
        outboundEventSignals.migrationJobCompleted(
                job.getId() != null ? job.getId() : "",
                request != null && request.sourceConnectionId() != null ? request.sourceConnectionId() : "",
                request != null && request.targetConnectionId() != null ? request.targetConnectionId() : "",
                request != null && request.tables() != null ? request.tables().size() : 0
        );
    }

    private void notifyMigrationFailed(
            MigrationJobEntity job,
            TableMigrationBatchRequest request,
            String message
    ) {
        if (job == null || job.getUserId() <= 0) {
            return;
        }
        outboundEventSignals.migrationJobFailed(
                job.getId() != null ? job.getId() : "",
                request != null && request.sourceConnectionId() != null ? request.sourceConnectionId() : "",
                request != null && request.targetConnectionId() != null ? request.targetConnectionId() : "",
                request != null && request.tables() != null ? request.tables().size() : 0,
                message != null ? message : ""
        );
    }

    private MigrationExecutorProvider migrationExecutor() {
        return migrationExecutorRegistry.requireDefault();
    }
}
