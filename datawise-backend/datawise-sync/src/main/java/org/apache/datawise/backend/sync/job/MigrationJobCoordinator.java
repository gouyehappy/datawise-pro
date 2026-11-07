package org.apache.datawise.backend.sync.job;

import org.apache.datawise.backend.config.TableMigrationProperties;
import org.apache.datawise.backend.configstore.migration.MigrationJobEntity;
import org.apache.datawise.backend.configstore.migration.MigrationJobStore;
import org.apache.datawise.backend.sync.api.MigrationCheckpointSink;
import org.apache.datawise.backend.sync.support.MigrationRequestFingerprint;
import org.apache.datawise.backend.domain.MigrationJobView;
import org.apache.datawise.backend.domain.MigrationTableCheckpoint;
import org.apache.datawise.backend.domain.TableMigrationBatchRequest;
import org.apache.datawise.backend.domain.TableMigrationBatchTableRequest;
import org.apache.datawise.backend.domain.TableMigrationResult;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/** 迁移任务 checkpoint 编排：创建、续传、持久化。 */
@Service
public class MigrationJobCoordinator {

    public record ExecutionContext(MigrationJobEntity job, MigrationCheckpointSink sink) {
        public String jobId() {
            return job.getId();
        }
    }

    private final MigrationJobStore jobStore;
    private final int checkpointPersistEveryBatches;

    @Autowired
    public MigrationJobCoordinator(MigrationJobStore jobStore, TableMigrationProperties migrationProperties) {
        this.jobStore = jobStore;
        TableMigrationProperties props = migrationProperties != null
                ? migrationProperties
                : new TableMigrationProperties();
        this.checkpointPersistEveryBatches = props.getCheckpointPersistEveryBatches();
    }

    public ExecutionContext prepare(long userId, TableMigrationBatchRequest request) {
        String fingerprint = MigrationRequestFingerprint.compute(request);
        if (request.resumeJobId() != null && !request.resumeJobId().isBlank()) {
            MigrationJobEntity job = jobStore.requireOwned(userId, request.resumeJobId().trim());
            validateResumable(job, fingerprint);
            job.setStatus("running");
            job.setUpdatedAt(Instant.now());
            jobStore.save(job);
            return new ExecutionContext(job, new JobBoundCheckpointSink(job, checkpointPersistEveryBatches));
        }

        String jobId = request.jobId() != null && !request.jobId().isBlank()
                ? request.jobId().trim()
                : UUID.randomUUID().toString();
        Optional<MigrationJobEntity> existing = jobStore.findOwned(userId, jobId);
        if (existing.isPresent()) {
            MigrationJobEntity job = existing.get();
            validateResumable(job, fingerprint);
            job.setStatus("running");
            job.setUpdatedAt(Instant.now());
            jobStore.save(job);
            return new ExecutionContext(job, new JobBoundCheckpointSink(job, checkpointPersistEveryBatches));
        }

        MigrationJobEntity job = new MigrationJobEntity();
        job.setId(jobId);
        job.setUserId(userId);
        job.setStatus("running");
        job.setRequestFingerprint(fingerprint);
        job.setRequest(request);
        job.setTablesPlanned(extractTableNames(request));
        job.setTables(new LinkedHashMap<>());
        job.setCreatedAt(Instant.now());
        job.setUpdatedAt(Instant.now());
        jobStore.save(job);
        return new ExecutionContext(job, new JobBoundCheckpointSink(job, checkpointPersistEveryBatches));
    }

    public MigrationJobView viewFor(long userId, String jobId) {
        MigrationJobEntity job = jobStore.requireOwned(userId, jobId);
        return toView(job);
    }

    public List<MigrationJobView> listViewsForUser(long userId) {
        return jobStore.listByUser(userId).stream()
                .sorted((left, right) -> {
                    Instant leftAt = left.getUpdatedAt() != null ? left.getUpdatedAt() : left.getCreatedAt();
                    Instant rightAt = right.getUpdatedAt() != null ? right.getUpdatedAt() : right.getCreatedAt();
                    if (leftAt == null && rightAt == null) return 0;
                    if (leftAt == null) return 1;
                    if (rightAt == null) return -1;
                    return rightAt.compareTo(leftAt);
                })
                .map(MigrationJobCoordinator::toView)
                .toList();
    }

    public MigrationJobEntity requireOwnedJob(long userId, String jobId) {
        return jobStore.requireOwned(userId, jobId);
    }

    public Optional<MigrationJobEntity> findJob(String jobId) {
        return jobStore.findById(jobId);
    }

    public ExecutionContext executionContextFor(MigrationJobEntity job) {
        if (job == null) {
            throw new IllegalArgumentException("job must not be null");
        }
        return new ExecutionContext(job, new JobBoundCheckpointSink(job, checkpointPersistEveryBatches));
    }

    public void finalizeJob(MigrationJobEntity job, List<TableMigrationResult> results) {
        job.setResults(results != null ? List.copyOf(results) : List.of());
        job.setStatus(resolveJobStatus(results));
        job.setUpdatedAt(Instant.now());
        jobStore.save(job);
    }

    public void markJobQueued(MigrationJobEntity job) {
        if (job == null) {
            return;
        }
        job.setStatus("queued");
        job.setUpdatedAt(Instant.now());
        jobStore.save(job);
    }

    public void markJobRunning(MigrationJobEntity job) {
        if (job == null) {
            return;
        }
        job.setStatus("running");
        job.setUpdatedAt(Instant.now());
        jobStore.save(job);
    }

    public void markJobPaused(MigrationJobEntity job) {
        if (job == null) {
            return;
        }
        job.setStatus("paused");
        job.setUpdatedAt(Instant.now());
        jobStore.save(job);
    }

    public void markJobCancelled(MigrationJobEntity job) {
        if (job == null) {
            return;
        }
        job.setStatus("cancelled");
        job.setUpdatedAt(Instant.now());
        jobStore.save(job);
    }

    public void markJobFailed(MigrationJobEntity job) {
        if (job == null) {
            return;
        }
        if ("completed".equals(job.getStatus())) {
            return;
        }
        job.setStatus("failed");
        job.setUpdatedAt(Instant.now());
        jobStore.save(job);
    }

    public void finalizeJobAfterFailure(MigrationJobEntity job, RuntimeException error) {
        if (job == null) {
            return;
        }
        List<TableMigrationResult> existing = job.getResults();
        if (existing != null && !existing.isEmpty()) {
            finalizeJob(job, existing);
            return;
        }
        String message = error != null && error.getMessage() != null && !error.getMessage().isBlank()
                ? error.getMessage()
                : "Migration failed";
        List<String> planned = job.getTablesPlanned() != null ? job.getTablesPlanned() : List.of();
        List<TableMigrationResult> results = planned.stream()
                .map(tableName -> new TableMigrationResult(
                        tableName,
                        0,
                        0,
                        0L,
                        "failed",
                        message,
                        null,
                        null,
                        null,
                        null
                ))
                .toList();
        finalizeJob(job, results);
    }

    private final class JobBoundCheckpointSink implements MigrationCheckpointSink {

        private final MigrationJobEntity job;
        private final int persistEveryBatches;
        private boolean dirty;

        private JobBoundCheckpointSink(MigrationJobEntity job, int persistEveryBatches) {
            this.job = job;
            this.persistEveryBatches = Math.max(1, persistEveryBatches);
        }

        @Override
        public boolean isTableCompleted(String tableName) {
            MigrationTableCheckpoint checkpoint = job.tableCheckpoint(tableName);
            return checkpoint != null && "completed".equals(checkpoint.getStatus());
        }

        @Override
        public boolean hasTableProgress(String tableName) {
            MigrationTableCheckpoint checkpoint = job.tableCheckpoint(tableName);
            if (checkpoint == null) {
                return false;
            }
            if (checkpoint.getBatchesCompleted() > 0) {
                return true;
            }
            return checkpoint.getLastOffset() > 0
                    || (checkpoint.getLastSeekKey() != null && !checkpoint.getLastSeekKey().isBlank());
        }

        @Override
        public Optional<ResumePoint> resumePointFor(String tableName, String selectSql, int batchSize) {
            MigrationTableCheckpoint checkpoint = job.tableCheckpoint(tableName);
            if (checkpoint == null) {
                return Optional.empty();
            }
            if ("completed".equals(checkpoint.getStatus())) {
                return Optional.of(new ResumePoint(
                        checkpoint.getLastOffset(),
                        checkpoint.getRowsMigrated(),
                        checkpoint.getBatchesCompleted(),
                        checkpoint.getLastWatermark(),
                        checkpoint.getLastSeekKey()
                ));
            }
            String fingerprint = MigrationRequestFingerprint.computeTable(tableName, selectSql, batchSize);
            if (checkpoint.getRequestFingerprint() != null
                    && !checkpoint.getRequestFingerprint().equals(fingerprint)) {
                throw new IllegalArgumentException(
                        "Table migration parameters changed for " + tableName + "; start a new job"
                );
            }
            if (checkpoint.getLastOffset() <= 0
                    && (checkpoint.getLastSeekKey() == null || checkpoint.getLastSeekKey().isBlank())) {
                return Optional.empty();
            }
            return Optional.of(new ResumePoint(
                    checkpoint.getLastOffset(),
                    checkpoint.getRowsMigrated(),
                    checkpoint.getBatchesCompleted(),
                    checkpoint.getLastWatermark(),
                    checkpoint.getLastSeekKey()
            ));
        }

        @Override
        public void onTableRunning(String tableName, String tableFingerprint) {
            synchronized (job) {
                MigrationTableCheckpoint checkpoint = checkpointFor(tableName);
                checkpoint.setStatus("running");
                checkpoint.setRequestFingerprint(tableFingerprint);
                checkpoint.setUpdatedAt(Instant.now());
                persistNow();
            }
        }

        @Override
        public void onBatchCommitted(
                String tableName,
                String tableFingerprint,
                long offset,
                long rowsMigrated,
                int batches,
                String lastWatermark,
                String lastSeekKey
        ) {
            synchronized (job) {
                MigrationTableCheckpoint checkpoint = checkpointFor(tableName);
                checkpoint.setStatus("running");
                checkpoint.setRequestFingerprint(tableFingerprint);
                checkpoint.setLastOffset(offset);
                checkpoint.setRowsMigrated(rowsMigrated);
                checkpoint.setBatchesCompleted(batches);
                checkpoint.setLastWatermark(lastWatermark);
                checkpoint.setLastSeekKey(lastSeekKey);
                checkpoint.setUpdatedAt(Instant.now());
                if (batches % persistEveryBatches == 0) {
                    persistNow();
                } else {
                    dirty = true;
                }
            }
        }

        @Override
        public void onTableCompleted(String tableName, String tableFingerprint, long rowsMigrated, int batches, String lastWatermark) {
            synchronized (job) {
                MigrationTableCheckpoint checkpoint = checkpointFor(tableName);
                checkpoint.setStatus("completed");
                checkpoint.setRequestFingerprint(tableFingerprint);
                checkpoint.setLastOffset(rowsMigrated);
                checkpoint.setRowsMigrated(rowsMigrated);
                checkpoint.setBatchesCompleted(batches);
                checkpoint.setLastWatermark(lastWatermark);
                checkpoint.setUpdatedAt(Instant.now());
                persistNow();
            }
        }

        @Override
        public void onTableFailed(String tableName, String tableFingerprint, long rowsMigrated, int batches) {
            synchronized (job) {
                MigrationTableCheckpoint checkpoint = checkpointFor(tableName);
                checkpoint.setStatus("failed");
                if (tableFingerprint != null) {
                    checkpoint.setRequestFingerprint(tableFingerprint);
                }
                if (rowsMigrated > 0) {
                    checkpoint.setRowsMigrated(rowsMigrated);
                    checkpoint.setLastOffset(rowsMigrated);
                }
                if (batches > 0) {
                    checkpoint.setBatchesCompleted(batches);
                }
                checkpoint.setUpdatedAt(Instant.now());
                persistNow();
            }
        }

        @Override
        public void flush() {
            synchronized (job) {
                if (dirty) {
                    persistNow();
                }
            }
        }

        @Override
        public long partialRowsFor(String tableName) {
            MigrationTableCheckpoint checkpoint = job.tableCheckpoint(tableName);
            return checkpoint != null ? checkpoint.getRowsMigrated() : 0L;
        }

        private MigrationTableCheckpoint checkpointFor(String tableName) {
            MigrationTableCheckpoint checkpoint = job.tableCheckpoint(tableName);
            if (checkpoint == null) {
                checkpoint = new MigrationTableCheckpoint();
                checkpoint.setTableName(tableName);
                checkpoint.setStatus("pending");
                job.putTableCheckpoint(checkpoint);
            }
            return checkpoint;
        }

        private void persistNow() {
            job.setUpdatedAt(Instant.now());
            jobStore.save(job);
            dirty = false;
        }
    }

    private static void validateResumable(MigrationJobEntity job, String fingerprint) {
        if (!fingerprint.equals(job.getRequestFingerprint())) {
            throw new IllegalArgumentException("Migration request changed since last run; start a new job");
        }
        if ("completed".equals(job.getStatus())) {
            throw new IllegalArgumentException("Migration job already completed");
        }
        if ("cancelled".equals(job.getStatus())) {
            throw new IllegalArgumentException("Migration job was cancelled; start a new job");
        }
    }

    private static List<String> extractTableNames(TableMigrationBatchRequest request) {
        return request.tables().stream()
                .map(TableMigrationBatchTableRequest::tableName)
                .map(name -> name != null ? name.trim() : "")
                .toList();
    }

    private static String resolveJobStatus(List<TableMigrationResult> results) {
        if (results == null || results.isEmpty()) {
            return "failed";
        }
        long failed = results.stream().filter(result -> !"success".equals(result.status())).count();
        if (failed == 0) {
            return "completed";
        }
        if (failed == results.size()) {
            return "failed";
        }
        return "partial";
    }

    private static MigrationJobView toView(MigrationJobEntity job) {
        Map<String, MigrationTableCheckpoint> tables = new LinkedHashMap<>();
        if (job.getTables() != null) {
            // Store already deep-copies entities for HTTP/SSE views; copy map entries for isolation.
            tables.putAll(job.getTables());
        }
        return new MigrationJobView(
                job.getId(),
                job.getStatus(),
                job.getTablesPlanned() != null ? List.copyOf(job.getTablesPlanned()) : List.of(),
                Map.copyOf(tables),
                job.getResults() != null ? List.copyOf(job.getResults()) : List.of(),
                job.getCreatedAt(),
                job.getUpdatedAt()
        );
    }
}
