package org.apache.datawise.backend.sync.job;

import org.apache.datawise.backend.config.TableMigrationProperties;
import org.apache.datawise.backend.sync.api.MigrationCheckpointSink;
import org.apache.datawise.backend.sync.support.MigrationRequestFingerprint;
import org.apache.datawise.backend.configstore.migration.MigrationJobEntity;
import org.apache.datawise.backend.configstore.migration.MigrationJobStore;
import org.apache.datawise.backend.domain.MigrationTableCheckpoint;
import org.apache.datawise.backend.domain.TableMigrationBatchRequest;
import org.apache.datawise.backend.domain.TableMigrationBatchTableRequest;
import org.apache.datawise.backend.domain.TableMigrationResult;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.atLeast;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class MigrationJobCoordinatorTest {

    @Mock
    private MigrationJobStore jobStore;

    private MigrationJobCoordinator coordinator;

    @BeforeEach
    void setUp() {
        TableMigrationProperties properties = new TableMigrationProperties();
        properties.setCheckpointPersistEveryBatches(1);
        coordinator = new MigrationJobCoordinator(jobStore, properties);
    }

    @Test
    void prepare_createsNewJobWhenJobIdUnused() {
        TableMigrationBatchRequest request = sampleRequest("job-new", null);
        when(jobStore.findOwned(1L, "job-new")).thenReturn(Optional.empty());
        when(jobStore.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        MigrationJobCoordinator.ExecutionContext context = coordinator.prepare(1L, request);

        assertEquals("job-new", context.jobId());
        assertEquals("running", context.job().getStatus());
        verify(jobStore).save(any(MigrationJobEntity.class));
    }

    @Test
    void prepare_resumesExistingJobWhenResumeJobIdProvided() {
        TableMigrationBatchRequest request = sampleRequest(null, "job-resume");
        MigrationJobEntity existing = existingJob("job-resume", 1L);
        when(jobStore.requireOwned(1L, "job-resume")).thenReturn(existing);
        when(jobStore.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        MigrationJobCoordinator.ExecutionContext context = coordinator.prepare(1L, request);

        assertEquals("job-resume", context.jobId());
        assertEquals("running", context.job().getStatus());
    }

    @Test
    void prepare_rejectsCompletedJobResume() {
        TableMigrationBatchRequest request = sampleRequest(null, "job-done");
        MigrationJobEntity existing = existingJob("job-done", 1L);
        existing.setStatus("completed");
        when(jobStore.requireOwned(1L, "job-done")).thenReturn(existing);

        IllegalArgumentException ex = assertThrows(
                IllegalArgumentException.class,
                () -> coordinator.prepare(1L, request)
        );
        assertEquals("Migration job already completed", ex.getMessage());
    }

    @Test
    void sink_persistsBatchCheckpoint() {
        TableMigrationBatchRequest request = sampleRequest("job-1", null);
        when(jobStore.findOwned(1L, "job-1")).thenReturn(Optional.empty());
        when(jobStore.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        MigrationCheckpointSink sink = coordinator.prepare(1L, request).sink();
        sink.onTableRunning("users", "fp-users");
        sink.onBatchCommitted("users", "fp-users", 500, 500, 1, "500", null);

        ArgumentCaptor<MigrationJobEntity> captor = ArgumentCaptor.forClass(MigrationJobEntity.class);
        verify(jobStore, org.mockito.Mockito.atLeast(2)).save(captor.capture());
        MigrationTableCheckpoint checkpoint = captor.getAllValues().get(captor.getAllValues().size() - 1).tableCheckpoint("users");
        assertEquals(500, checkpoint.getLastOffset());
        assertEquals(1, checkpoint.getBatchesCompleted());
    }

    @Test
    void sink_throttlesBatchPersistUntilInterval() {
        TableMigrationProperties properties = new TableMigrationProperties();
        properties.setCheckpointPersistEveryBatches(10);
        MigrationJobCoordinator throttledCoordinator = new MigrationJobCoordinator(jobStore, properties);
        TableMigrationBatchRequest request = sampleRequest("job-throttle", null);
        when(jobStore.findOwned(1L, "job-throttle")).thenReturn(Optional.empty());
        when(jobStore.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        MigrationCheckpointSink sink = throttledCoordinator.prepare(1L, request).sink();
        clearInvocations(jobStore);
        sink.onTableRunning("users", "fp-users");
        sink.onBatchCommitted("users", "fp-users", 500, 500, 1, "500", null);

        verify(jobStore, times(1)).save(any(MigrationJobEntity.class));

        sink.flush();
        verify(jobStore, times(2)).save(any(MigrationJobEntity.class));
    }

    @Test
    void finalizeJob_marksPartialWhenSomeTablesFail() {
        MigrationJobEntity job = existingJob("job-1", 1L);
        when(jobStore.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        coordinator.finalizeJob(
                job,
                List.of(
                        new TableMigrationResult("users", 1, 1, 10, "success", null, null, null, null, "match"),
                        new TableMigrationResult("orders", 0, 0, 10, "failed", "boom", null, null, null, null)
                )
        );

        assertEquals("partial", job.getStatus());
    }

    @Test
    void finalizeJobAfterFailure_populatesFailedResultsWhenMissing() {
        MigrationJobEntity job = existingJob("job-1", 1L);
        when(jobStore.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        coordinator.finalizeJobAfterFailure(job, new IllegalArgumentException("Target table missing"));

        assertEquals("failed", job.getStatus());
        assertEquals(1, job.getResults().size());
        assertEquals("failed", job.getResults().get(0).status());
        assertEquals("Target table missing", job.getResults().get(0).message());
    }

    @Test
    void sink_persistsLastSeekKeyForKeysetResume() {
        TableMigrationBatchRequest request = sampleRequest("job-keyset", null);
        when(jobStore.findOwned(1L, "job-keyset")).thenReturn(Optional.empty());
        when(jobStore.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        String selectSql = "SELECT * FROM users ORDER BY id ASC";
        String fingerprint = MigrationRequestFingerprint.computeTable("users", selectSql, 500);
        MigrationCheckpointSink sink = coordinator.prepare(1L, request).sink();
        sink.onTableRunning("users", fingerprint);
        sink.onBatchCommitted("users", fingerprint, 1000, 1000, 2, null, "[\"42\",\"acme\"]");

        MigrationCheckpointSink.ResumePoint point = sink
                .resumePointFor("users", selectSql, 500)
                .orElseThrow();
        assertEquals("[\"42\",\"acme\"]", point.lastSeekKey());
        assertEquals(1000, point.priorRowsMigrated());
    }

    @Test
    void sink_hasTableProgress_whenLastSeekKeyPresent() {
        TableMigrationBatchRequest request = sampleRequest("job-seek-progress", null);
        when(jobStore.findOwned(1L, "job-seek-progress")).thenReturn(Optional.empty());
        when(jobStore.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        String selectSql = "SELECT * FROM users ORDER BY id ASC";
        String fingerprint = MigrationRequestFingerprint.computeTable("users", selectSql, 500);
        MigrationCheckpointSink sink = coordinator.prepare(1L, request).sink();
        sink.onBatchCommitted("users", fingerprint, 0, 0, 1, null, "[\"1\"]");

        assertTrue(sink.hasTableProgress("users"));
    }

    private static TableMigrationBatchRequest sampleRequest(String jobId, String resumeJobId) {
        return new TableMigrationBatchRequest(
                "src",
                "shop",
                "tgt",
                "warehouse",
                List.of(new TableMigrationBatchTableRequest("users", false)),
                null,
                null,
                null,
                null,
                500,
                0,
                true,
                jobId,
                resumeJobId,
                null,
                null
        );
    }

    private static MigrationJobEntity existingJob(String id, long userId) {
        MigrationJobEntity job = new MigrationJobEntity();
        job.setId(id);
        job.setUserId(userId);
        job.setStatus("failed");
        job.setRequestFingerprint(MigrationRequestFingerprint.compute(sampleRequest(id, null)));
        job.setRequest(sampleRequest(id, null));
        job.setTablesPlanned(List.of("users"));
        job.setTables(new LinkedHashMap<>());
        job.setCreatedAt(Instant.now());
        job.setUpdatedAt(Instant.now());
        return job;
    }
}
