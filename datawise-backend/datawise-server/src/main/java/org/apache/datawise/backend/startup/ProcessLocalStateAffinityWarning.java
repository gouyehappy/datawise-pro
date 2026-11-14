package org.apache.datawise.backend.startup;

import org.apache.datawise.backend.config.DeploymentAffinityProperties;
import org.apache.datawise.backend.config.StorageProperties;
import org.apache.datawise.taskconcurrency.spring.TaskConcurrencySpringProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

import java.util.Arrays;
import java.util.Locale;

/**
 * Reminds cloud operators that console SQL sessions and live AI SSE are process-local
 * and require sticky load-balancing (or a single replica). Shared cursors use JDBC when configured.
 * See docs/DEPLOYMENT.md#affinity.
 */
@Component
@Order(55)
public class ProcessLocalStateAffinityWarning implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(ProcessLocalStateAffinityWarning.class);

    private final Environment environment;
    private final StorageProperties storageProperties;
    private final DeploymentAffinityProperties deploymentAffinityProperties;
    private final TaskConcurrencySpringProperties taskConcurrencyProperties;

    public ProcessLocalStateAffinityWarning(
            Environment environment,
            StorageProperties storageProperties,
            DeploymentAffinityProperties deploymentAffinityProperties,
            @Autowired(required = false) TaskConcurrencySpringProperties taskConcurrencyProperties
    ) {
        this.environment = environment;
        this.storageProperties = storageProperties;
        this.deploymentAffinityProperties = deploymentAffinityProperties;
        this.taskConcurrencyProperties = taskConcurrencyProperties;
    }

    @Override
    public void run(ApplicationArguments args) {
        if (!isCloudProfile()) {
            return;
        }

        String affinityMode = deploymentAffinityProperties.getAffinityMode().name().toLowerCase(Locale.ROOT);
        String storageBackend = storageProperties.getBackend();
        String taskStore = resolveTaskStoreType();
        String sseBus = env("datawise.sse.bus-type", "in-memory");
        String cursorStore = env("datawise.query.cursor-store-type", "in-memory");
        String checkpointStorage = env("datawise.ai.analysis.checkpoint.storage", "file");
        boolean jdbcCursor = "jdbc".equalsIgnoreCase(cursorStore);

        if (deploymentAffinityProperties.stickyRequired()) {
            log.warn(
                    "Cloud profile active (affinity-mode={}): console SQL sessions and live AI analysis SSE "
                            + "are process-local. Use sticky sessions — see docs/DEPLOYMENT.md#affinity. "
                            + "stores: storage.backend={}, cursor-store-type={}, task-concurrency.store-type={}, "
                            + "sse.bus-type={}, checkpoint.storage={}",
                    affinityMode, storageBackend, cursorStore, taskStore, sseBus, checkpointStorage);
        } else {
            log.warn(
                    "Cloud profile active (affinity-mode=single): run a single replica for process-local "
                            + "console sessions / live AI SSE. stores: storage.backend={}, cursor-store-type={}, "
                            + "task-concurrency.store-type={}, sse.bus-type={}",
                    storageBackend, cursorStore, taskStore, sseBus);
        }

        if (!storageProperties.isJdbc()) {
            log.error(
                    "Cloud profile expects datawise.storage.backend=jdbc for shared auth sessions and login "
                            + "throttle; current={}. See docs/DEPLOYMENT.md#affinity.",
                    storageBackend);
        } else if (storageProperties.isMemoryH2Metadata()) {
            log.error(
                    "Cloud profile uses in-memory H2 metadata (jdbc-url={}). Override datawise.storage.datasource "
                            + "with durable Postgres (or compatible) in config/ overlay — see docs/DEPLOYMENT.md.",
                    storageProperties.getDatasource().getJdbcUrl());
        }
        if (!jdbcCursor) {
            log.error(
                    "Cloud profile expects datawise.query.cursor-store-type=jdbc for shared SQL result paging; "
                            + "current={}. See docs/DEPLOYMENT.md#affinity.",
                    cursorStore);
        } else if (jdbcCursor && storageProperties.isJdbc()) {
            log.info("Cloud SQL result cursors use shared JDBC metadata (dw_sql_cursors).");
        }
        if (!"jdbc".equalsIgnoreCase(taskStore)
                && !( "auto".equalsIgnoreCase(taskStore) && storageProperties.isJdbc())) {
            log.error(
                    "Cloud profile expects datawise.task-concurrency.store-type=jdbc (or auto with storage.jdbc); "
                            + "current={}. See docs/DEPLOYMENT.md#affinity.",
                    taskStore);
        }
        if (!"jdbc".equalsIgnoreCase(sseBus)) {
            log.error(
                    "Cloud profile expects datawise.sse.bus-type=jdbc for multi-instance Migration/shared Query "
                            + "SSE; current={}. See docs/DEPLOYMENT.md#affinity.",
                    sseBus);
        }
        if (!"file".equalsIgnoreCase(checkpointStorage)) {
            log.error(
                    "Cloud profile expects datawise.ai.analysis.checkpoint.storage=file for interrupt/resume; "
                            + "current={}. Mount a shared volume on config/ai-checkpoints/ for multi-replica resume "
                            + "(docs/DEPLOYMENT.md#affinity).",
                    checkpointStorage);
        } else {
            log.info(
                    "AI analysis checkpoint.storage=file — mount a shared volume on config/ai-checkpoints/ "
                            + "so interrupt/resume works across replicas. Live SSE still requires sticky.");
        }
        if (storageProperties.isJdbc()) {
            log.info("Cloud login throttle uses shared JDBC metadata (dw_login_attempt) when storage.backend=jdbc.");
        } else {
            log.warn(
                    "Cloud profile: LoginAttemptGuard is in-memory per JVM — multi-replica lockout can be "
                            + "bypassed. Prefer storage.backend=jdbc or gateway rate-limits "
                            + "(docs/DEPLOYMENT.md#affinity).");
        }
    }

    private String resolveTaskStoreType() {
        if (taskConcurrencyProperties == null || taskConcurrencyProperties.getStoreType() == null) {
            return env("datawise.task-concurrency.store-type", "in-memory");
        }
        return taskConcurrencyProperties.getStoreType().name().toLowerCase(Locale.ROOT);
    }

    private String env(String key, String defaultValue) {
        String value = environment.getProperty(key);
        return value == null || value.isBlank() ? defaultValue : value.trim();
    }

    private boolean isCloudProfile() {
        return Arrays.stream(environment.getActiveProfiles())
                .anyMatch(profile -> "cloud".equalsIgnoreCase(profile));
    }
}
