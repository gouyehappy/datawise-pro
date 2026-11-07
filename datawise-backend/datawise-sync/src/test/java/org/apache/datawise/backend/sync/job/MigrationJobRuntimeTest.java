package org.apache.datawise.backend.sync.job;

import org.apache.datawise.backend.sync.api.MigrationCancelledException;
import org.apache.datawise.backend.sync.api.MigrationPausedException;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class MigrationJobRuntimeTest {

    @Test
    void tryRegisterRunning_rejectsDuplicateJobId() {
        MigrationJobRuntime runtime = new MigrationJobRuntime();
        assertTrue(runtime.tryRegisterRunning("job-1"));
        assertFalse(runtime.tryRegisterRunning("job-1"));
    }

    @Test
    void registerRunning_throwsWhenDuplicateJobId() {
        MigrationJobRuntime runtime = new MigrationJobRuntime();
        runtime.registerRunning("job-1");
        assertThrows(IllegalStateException.class, () -> runtime.registerRunning("job-1"));
    }

    @Test
    void controlFor_throwsWhenPauseRequested() {
        MigrationJobRuntime runtime = new MigrationJobRuntime();
        runtime.registerRunning("job-1");
        runtime.requestPause("job-1");

        MigrationPausedException ex = assertThrows(
                MigrationPausedException.class,
                () -> runtime.controlFor("job-1").checkContinue()
        );
        assertEquals("job-1", ex.getJobId());
    }

    @Test
    void tryRegisterRunning_preservesPriorPauseRequest() {
        MigrationJobRuntime runtime = new MigrationJobRuntime();
        runtime.requestPause("job-1");
        assertTrue(runtime.tryRegisterRunning("job-1"));

        MigrationPausedException ex = assertThrows(
                MigrationPausedException.class,
                () -> runtime.controlFor("job-1").checkContinue()
        );
        assertEquals("job-1", ex.getJobId());
    }

    @Test
    void requestCancel_interruptsBoundWorkerThread() throws InterruptedException {
        MigrationJobRuntime runtime = new MigrationJobRuntime();
        runtime.registerRunning("job-1");
        Thread worker = new Thread(() -> {
            runtime.bindWorkerThread("job-1");
            try {
                Thread.sleep(30_000L);
            } catch (InterruptedException ignored) {
                Thread.currentThread().interrupt();
            }
        }, "migration-test-worker");
        worker.start();
        Thread.sleep(50L);
        runtime.requestCancel("job-1");
        worker.join(2_000L);
        assertFalse(worker.isAlive());
        assertThrows(MigrationCancelledException.class, () -> runtime.controlFor("job-1").checkContinue());
    }
}
