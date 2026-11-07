package org.apache.datawise.backend.sync.web;

import org.apache.datawise.backend.common.ApiResponse;
import org.apache.datawise.backend.domain.pack.MigrationAccessGate;
import org.apache.datawise.backend.domain.MigrationBatchReport;
import org.apache.datawise.backend.domain.MigrationJobView;
import org.apache.datawise.backend.domain.TableMigrationBatchRequest;
import org.apache.datawise.backend.domain.TableMigrationBatchResult;
import org.apache.datawise.backend.domain.TableMigrationPreflightRequest;
import org.apache.datawise.backend.domain.TableMigrationPreflightResult;
import org.apache.datawise.backend.domain.TableMigrationRequest;
import org.apache.datawise.backend.domain.TableMigrationResult;
import org.apache.datawise.backend.domain.TableMigrationRowDiffRequest;
import org.apache.datawise.backend.domain.TableMigrationRowDiffResult;
import org.apache.datawise.backend.sync.support.MigrationBatchReportSupport;
import org.apache.datawise.backend.sync.preflight.TableMigrationPreflightService;
import org.apache.datawise.backend.sync.preflight.TableMigrationRowDiffService;
import org.apache.datawise.backend.sync.api.MigrationCancelledException;
import org.apache.datawise.backend.sync.api.MigrationPausedException;
import org.apache.datawise.backend.sync.api.TableMigrationProgressListener;
import org.apache.datawise.backend.sync.TableMigrationService;
import org.apache.datawise.backend.sync.stream.TableMigrationStreamEmitter;
import org.apache.datawise.backend.security.HeadlessMigrationAuth;
import org.apache.datawise.backend.security.UserContext;
import org.apache.datawise.backend.common.support.ApiRequestLogger;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;

@RestController
@RequestMapping("/api/migration")
public class MigrationController {

    private static final Logger log = LoggerFactory.getLogger(MigrationController.class);

    private final TableMigrationService tableMigrationService;
    private final TableMigrationPreflightService tableMigrationPreflightService;
    private final TableMigrationRowDiffService tableMigrationRowDiffService;
    private final ExecutorService migrationJobTaskExecutor;
    private final MigrationAccessGate migrationAccessGate;

    public MigrationController(
            TableMigrationService tableMigrationService,
            TableMigrationPreflightService tableMigrationPreflightService,
            TableMigrationRowDiffService tableMigrationRowDiffService,
            @Qualifier("migrationJobTaskExecutor") ExecutorService migrationJobTaskExecutor,
            MigrationAccessGate migrationAccessGate
    ) {
        this.tableMigrationService = tableMigrationService;
        this.tableMigrationPreflightService = tableMigrationPreflightService;
        this.tableMigrationRowDiffService = tableMigrationRowDiffService;
        this.migrationJobTaskExecutor = migrationJobTaskExecutor;
        this.migrationAccessGate = migrationAccessGate;
    }

    @PostMapping("/jobs")
    public ApiResponse<MigrationJobView> startMigrationJob(@RequestBody TableMigrationBatchRequest request) {
        requireMigrationAccess();
        TableMigrationBatchRequest capped = migrationAccessGate.applyMigrationTrialCap(request);
        ApiRequestLogger.logEntry(
                log,
                "POST /api/migration/jobs",
                "sourceConnectionId", capped.sourceConnectionId(),
                "targetConnectionId", capped.targetConnectionId(),
                "tables", capped.tables() != null ? capped.tables().size() : 0
        );
        try {
            MigrationJobView view = tableMigrationService.startJobAsync(capped);
            ApiRequestLogger.logSuccess(log, "POST /api/migration/jobs", "jobId", view.id(), "status", view.status());
            return ApiResponse.ok(view);
        } catch (RuntimeException ex) {
            ApiRequestLogger.logFailure(log, "POST /api/migration/jobs", ex, "targetConnectionId", capped.targetConnectionId());
            throw ex;
        }
    }

    @PostMapping("/jobs/{id}/pause")
    public ApiResponse<MigrationJobView> pauseMigrationJob(@PathVariable("id") String jobId) {
        requireMigrationAccess();
        ApiRequestLogger.logEntry(log, "POST /api/migration/jobs/{id}/pause", "jobId", jobId);
        try {
            MigrationJobView view = tableMigrationService.pauseJob(jobId);
            ApiRequestLogger.logSuccess(log, "POST /api/migration/jobs/{id}/pause", "status", view.status());
            return ApiResponse.ok(view);
        } catch (RuntimeException ex) {
            ApiRequestLogger.logFailure(log, "POST /api/migration/jobs/{id}/pause", ex, "jobId", jobId);
            throw ex;
        }
    }

    @PostMapping("/jobs/{id}/cancel")
    public ApiResponse<MigrationJobView> cancelMigrationJob(@PathVariable("id") String jobId) {
        requireMigrationAccess();
        ApiRequestLogger.logEntry(log, "POST /api/migration/jobs/{id}/cancel", "jobId", jobId);
        try {
            MigrationJobView view = tableMigrationService.cancelJob(jobId);
            ApiRequestLogger.logSuccess(log, "POST /api/migration/jobs/{id}/cancel", "status", view.status());
            return ApiResponse.ok(view);
        } catch (RuntimeException ex) {
            ApiRequestLogger.logFailure(log, "POST /api/migration/jobs/{id}/cancel", ex, "jobId", jobId);
            throw ex;
        }
    }

    @PostMapping("/jobs/{id}/resume")
    public ApiResponse<MigrationJobView> resumeMigrationJob(@PathVariable("id") String jobId) {
        requireMigrationAccess();
        ApiRequestLogger.logEntry(log, "POST /api/migration/jobs/{id}/resume", "jobId", jobId);
        try {
            MigrationJobView view = tableMigrationService.resumeJobAsync(jobId);
            ApiRequestLogger.logSuccess(log, "POST /api/migration/jobs/{id}/resume", "status", view.status());
            return ApiResponse.ok(view);
        } catch (RuntimeException ex) {
            ApiRequestLogger.logFailure(log, "POST /api/migration/jobs/{id}/resume", ex, "jobId", jobId);
            throw ex;
        }
    }

    @GetMapping("/jobs")
    public ApiResponse<List<MigrationJobView>> listMigrationJobs() {
        requireMigrationAccess();
        ApiRequestLogger.logEntry(log, "GET /api/migration/jobs");
        try {
            List<MigrationJobView> views = tableMigrationService.listJobs();
            ApiRequestLogger.logSuccess(log, "GET /api/migration/jobs", "count", views.size());
            return ApiResponse.ok(views);
        } catch (RuntimeException ex) {
            ApiRequestLogger.logFailure(log, "GET /api/migration/jobs", ex);
            throw ex;
        }
    }

    @GetMapping("/jobs/{id}")
    public ApiResponse<MigrationJobView> getMigrationJob(@PathVariable("id") String jobId) {
        requireMigrationAccess();
        ApiRequestLogger.logEntry(log, "GET /api/migration/jobs/{id}", "jobId", jobId);
        try {
            MigrationJobView view = tableMigrationService.getJob(jobId);
            ApiRequestLogger.logSuccess(log, "GET /api/migration/jobs/{id}", "status", view.status());
            return ApiResponse.ok(view);
        } catch (RuntimeException ex) {
            ApiRequestLogger.logFailure(log, "GET /api/migration/jobs/{id}", ex, "jobId", jobId);
            throw ex;
        }
    }

    @GetMapping(value = "/jobs/{id}/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter streamMigrationJob(@PathVariable("id") String jobId) {
        requireMigrationAccess();
        ApiRequestLogger.logEntry(log, "GET /api/migration/jobs/{id}/stream", "jobId", jobId);
        SseEmitter emitter = TableMigrationStreamEmitter.createEmitter();
        UserContext.Snapshot userSnapshot = UserContext.snapshotOrNull();
        CompletableFuture.runAsync(() -> UserContext.runAs(userSnapshot, () -> {
            try {
                tableMigrationService.openJobStream(jobId, emitter);
                ApiRequestLogger.logSuccess(log, "GET /api/migration/jobs/{id}/stream", "jobId", jobId);
            } catch (RuntimeException ex) {
                ApiRequestLogger.logFailure(log, "GET /api/migration/jobs/{id}/stream", ex, "jobId", jobId);
                TableMigrationStreamEmitter.completeFailure(emitter, ex, log);
            }
        }), migrationJobTaskExecutor);
        return emitter;
    }

    @PostMapping("/preflight")
    public ApiResponse<TableMigrationPreflightResult> preflightMigration(
            @RequestBody TableMigrationPreflightRequest request
    ) {
        requireMigrationAccess();
        ApiRequestLogger.logEntry(
                log,
                "POST /api/migration/preflight",
                "sourceConnectionId", request.sourceConnectionId(),
                "targetConnectionId", request.targetConnectionId(),
                "tables", request.tableNames() != null ? request.tableNames().size() : 0
        );
        try {
            TableMigrationPreflightResult result = tableMigrationPreflightService.preflight(request);
            ApiRequestLogger.logSuccess(
                    log,
                    "POST /api/migration/preflight",
                    "ready", result.readyCount(),
                    "warn", result.warnCount(),
                    "blocked", result.blockedCount()
            );
            return ApiResponse.ok(result);
        } catch (RuntimeException ex) {
            ApiRequestLogger.logFailure(
                    log,
                    "POST /api/migration/preflight",
                    ex,
                    "targetConnectionId", request.targetConnectionId()
            );
            throw ex;
        }
    }

    @PostMapping("/row-diff")
    public ApiResponse<TableMigrationRowDiffResult> rowDiff(@RequestBody TableMigrationRowDiffRequest request) {
        requireMigrationAccess();
        ApiRequestLogger.logEntry(
                log,
                "POST /api/migration/row-diff",
                "sourceConnectionId", request.sourceConnectionId(),
                "targetConnectionId", request.targetConnectionId(),
                "tableName", request.tableName()
        );
        try {
            TableMigrationRowDiffResult result = tableMigrationRowDiffService.diff(request);
            ApiRequestLogger.logSuccess(
                    log,
                    "POST /api/migration/row-diff",
                    "sampled", result.sampledSourceRows(),
                    "insert", result.insertCount(),
                    "update", result.updateCount()
            );
            return ApiResponse.ok(result);
        } catch (RuntimeException ex) {
            ApiRequestLogger.logFailure(
                    log,
                    "POST /api/migration/row-diff",
                    ex,
                    "tableName", request.tableName()
            );
            throw ex;
        }
    }

    @PostMapping("/batch")
    public ApiResponse<MigrationBatchReport> migrateBatchHeadless(@RequestBody TableMigrationBatchRequest request) {
        requireMigrationAccess();
        TableMigrationBatchRequest capped = migrationAccessGate.applyMigrationTrialCap(request);
        ApiRequestLogger.logEntry(
                log,
                "POST /api/migration/batch",
                "sourceConnectionId", capped.sourceConnectionId(),
                "targetConnectionId", capped.targetConnectionId(),
                "tables", capped.tables() != null ? capped.tables().size() : 0
        );
        long startedAt = System.currentTimeMillis();
        try {
            TableMigrationBatchResult result = tableMigrationService.migrateTables(capped);
            MigrationBatchReport report = MigrationBatchReportSupport.buildSyncReport(result.results(), startedAt);
            ApiRequestLogger.logSuccess(
                    log,
                    "POST /api/migration/batch",
                    "overallStatus", report.overallStatus(),
                    "success", report.successCount(),
                    "failed", report.failedCount()
            );
            return ApiResponse.ok(report);
        } catch (RuntimeException ex) {
            ApiRequestLogger.logFailure(
                    log,
                    "POST /api/migration/batch",
                    ex,
                    "targetConnectionId", capped.targetConnectionId()
            );
            throw ex;
        }
    }

    @PostMapping("/tables/batch")
    public ApiResponse<TableMigrationBatchResult> migrateTablesBatch(
            @RequestBody TableMigrationBatchRequest request
    ) {
        requireMigrationAccess();
        TableMigrationBatchRequest capped = migrationAccessGate.applyMigrationTrialCap(request);
        ApiRequestLogger.logEntry(
                log,
                "POST /api/migration/tables/batch",
                "sourceConnectionId", capped.sourceConnectionId(),
                "targetConnectionId", capped.targetConnectionId(),
                "tables", capped.tables() != null ? capped.tables().size() : 0
        );
        try {
            TableMigrationBatchResult result = tableMigrationService.migrateTables(capped);
            ApiRequestLogger.logSuccess(
                    log,
                    "POST /api/migration/tables/batch",
                    "tables", result.results().size()
            );
            return ApiResponse.ok(result);
        } catch (RuntimeException ex) {
            ApiRequestLogger.logFailure(
                    log,
                    "POST /api/migration/tables/batch",
                    ex,
                    "targetConnectionId", capped.targetConnectionId()
            );
            throw ex;
        }
    }

    @PostMapping(value = "/tables/batch/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter migrateTablesBatchStream(@RequestBody TableMigrationBatchRequest request) {
        requireMigrationAccess();
        TableMigrationBatchRequest capped = migrationAccessGate.applyMigrationTrialCap(request);
        ApiRequestLogger.logEntry(
                log,
                "POST /api/migration/tables/batch/stream",
                "sourceConnectionId", capped.sourceConnectionId(),
                "targetConnectionId", capped.targetConnectionId(),
                "tables", capped.tables() != null ? capped.tables().size() : 0
        );
        SseEmitter emitter = TableMigrationStreamEmitter.createEmitter();
        UserContext.Snapshot userSnapshot = UserContext.snapshotOrNull();
        CompletableFuture.runAsync(
                () -> UserContext.runAs(userSnapshot, () -> streamBatchMigration(capped, emitter)),
                migrationJobTaskExecutor
        );
        return emitter;
    }

    @PostMapping("/table")
    public ApiResponse<TableMigrationResult> migrateTable(@RequestBody TableMigrationRequest request) {
        requireMigrationAccess();
        TableMigrationRequest capped = migrationAccessGate.applyMigrationTrialCap(request);
        ApiRequestLogger.logEntry(
                log,
                "POST /api/migration/table",
                "sourceConnectionId", capped.sourceConnectionId(),
                "targetConnectionId", capped.targetConnectionId(),
                "tableName", capped.tableName()
        );
        try {
            TableMigrationResult result = tableMigrationService.migrateTable(capped);
            ApiRequestLogger.logSuccess(
                    log,
                    "POST /api/migration/table",
                    "rowsMigrated", result.rowsMigrated(),
                    "batches", result.batches()
            );
            return ApiResponse.ok(result);
        } catch (RuntimeException ex) {
            ApiRequestLogger.logFailure(
                    log,
                    "POST /api/migration/table",
                    ex,
                    "tableName", capped.tableName()
            );
            throw ex;
        }
    }

    private void streamBatchMigration(TableMigrationBatchRequest request, SseEmitter emitter) {
        try {
            TableMigrationBatchResult result = tableMigrationService.migrateTablesStream(
                    request,
                    new TableMigrationProgressListener() {
                        @Override
                        public void onTableStart(int tableIndex, int tableTotal, String tableName) {
                            TableMigrationStreamEmitter.sendTableStart(emitter, tableIndex, tableTotal, tableName);
                        }

                        @Override
                        public void onTableResult(int tableIndex, int tableTotal, TableMigrationResult tableResult) {
                            TableMigrationStreamEmitter.sendTableResult(emitter, tableIndex, tableTotal, tableResult);
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
                            TableMigrationStreamEmitter.sendBatchProgress(
                                    emitter,
                                    tableIndex,
                                    tableTotal,
                                    tableName,
                                    offset,
                                    rowsMigrated,
                                    batches
                            );
                        }
                    }
            );
            TableMigrationStreamEmitter.sendDone(emitter, result);
            ApiRequestLogger.logSuccess(
                    log,
                    "POST /api/migration/tables/batch/stream",
                    "tables", result.results().size()
            );
            TableMigrationStreamEmitter.completeSuccess(emitter);
        } catch (MigrationCancelledException ex) {
            MigrationJobView view = tableMigrationService.getJob(ex.getJobId());
            TableMigrationStreamEmitter.sendJobDone(emitter, view);
            TableMigrationStreamEmitter.completeSuccess(emitter);
        } catch (MigrationPausedException ex) {
            MigrationJobView view = tableMigrationService.getJob(ex.getJobId());
            TableMigrationStreamEmitter.sendJobPaused(emitter, view);
            TableMigrationStreamEmitter.completeSuccess(emitter);
        } catch (RuntimeException ex) {
            ApiRequestLogger.logFailure(
                    log,
                    "POST /api/migration/tables/batch/stream",
                    ex,
                    "targetConnectionId", request.targetConnectionId()
            );
            TableMigrationStreamEmitter.completeFailure(emitter, ex, log);
        }
    }

    private static void requireMigrationAccess() {
        HeadlessMigrationAuth.requireMigrationAccess();
    }
}
