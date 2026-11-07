package org.apache.datawise.backend.backup;

import org.apache.datawise.backend.config.BackupProperties;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@Configuration
public class BackupConfiguration {

    /**
     * Legacy fallback when {@code TaskConcurrencyRuntime} is unavailable.
     * Prefer admitting runs through task-concurrency ({@code BackupTaskAdmissionService}).
     */
    @Bean(name = "backupJobTaskExecutor", destroyMethod = "shutdown")
    @Qualifier("backupJobTaskExecutor")
    ExecutorService backupJobTaskExecutor(BackupProperties properties) {
        int poolSize = Math.max(1, properties.getMaxConcurrentRuns());
        return Executors.newFixedThreadPool(
                poolSize,
                runnable -> {
                    Thread thread = new Thread(runnable, "backup-job");
                    thread.setDaemon(true);
                    return thread;
                }
        );
    }

    /**
     * Work parallelism inside an already-admitted database backup run (per-table gzip export).
     * Does not participate in global task-concurrency slot admission.
     */
    @Bean(name = "backupTableTaskExecutor", destroyMethod = "shutdown")
    @Qualifier("backupTableTaskExecutor")
    ExecutorService backupTableTaskExecutor(BackupProperties properties) {
        int poolSize = Math.max(1, properties.getTableParallelism());
        return Executors.newFixedThreadPool(
                poolSize,
                runnable -> {
                    Thread thread = new Thread(runnable, "backup-table");
                    thread.setDaemon(true);
                    return thread;
                }
        );
    }
}
