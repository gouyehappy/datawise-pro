package org.apache.datawise.backend.sync.config;

import org.apache.datawise.backend.config.TableMigrationProperties;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@Configuration
public class MigrationSyncConfiguration {

    @Bean(name = "migrationJobTaskExecutor", destroyMethod = "shutdown")
    @Qualifier("migrationJobTaskExecutor")
    ExecutorService migrationJobTaskExecutor(TableMigrationProperties properties) {
        int threads = properties != null ? properties.getMigrationJobThreads() : 4;
        int poolSize = Math.max(1, threads);
        return Executors.newFixedThreadPool(
                poolSize,
                runnable -> {
                    Thread thread = new Thread(runnable, "migration-job");
                    thread.setDaemon(true);
                    return thread;
                }
        );
    }
}
