package org.apache.datawise.backend.server.deployment;

import org.apache.datawise.backend.config.DeploymentAffinityProperties;
import org.apache.datawise.backend.config.StorageProperties;
import org.apache.datawise.taskconcurrency.spring.TaskConcurrencySpringProperties;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.actuate.health.Health;
import org.springframework.boot.actuate.health.HealthIndicator;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

import java.util.Arrays;
import java.util.Locale;

/**
 * Cloud readiness for shared metadata stores + affinity posture.
 * Misconfigured cloud (file metadata / in-memory H2 / in-memory SSE) reports {@code DOWN}
 * so operators notice before traffic. Non-cloud profiles stay {@code UP}.
 */
@Component("deploymentAffinity")
public class DeploymentAffinityHealthIndicator implements HealthIndicator {

    private final Environment environment;
    private final StorageProperties storageProperties;
    private final DeploymentAffinityProperties deploymentAffinityProperties;
    private final TaskConcurrencySpringProperties taskConcurrencyProperties;

    public DeploymentAffinityHealthIndicator(
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
    public Health health() {
        String affinityMode = deploymentAffinityProperties.getAffinityMode().name().toLowerCase(Locale.ROOT);
        String cursorStore = env("datawise.query.cursor-store-type", "in-memory");
        String checkpointStorage = env("datawise.ai.analysis.checkpoint.storage", "file");
        Health.Builder builder = Health.up()
                .withDetail("affinityMode", affinityMode)
                .withDetail("stickyRequired", deploymentAffinityProperties.stickyRequired())
                .withDetail("storageBackend", storageProperties.getBackend())
                .withDetail("cursorStoreType", cursorStore)
                .withDetail("taskConcurrencyStore", resolveTaskStoreType())
                .withDetail("sseBusType", env("datawise.sse.bus-type", "in-memory"))
                .withDetail("checkpointStorage", checkpointStorage)
                .withDetail(
                        "stickyStillRequiredFor",
                        "console SQL sessions; live AI SSE; TX-bound cursors")
                .withDetail("docs", "DEPLOYMENT.md#affinity");

        if (!isCloudProfile()) {
            return builder.withDetail("cloudProfile", false).build();
        }

        builder.withDetail("cloudProfile", true);
        boolean ok = true;
        if (!storageProperties.isJdbc()) {
            ok = false;
            builder.withDetail("storage.backend.expected", "jdbc");
        } else if (storageProperties.isMemoryH2Metadata()) {
            ok = false;
            builder.withDetail("storage.datasource", "h2:mem (ephemeral — override for production)");
        }
        if (!"jdbc".equalsIgnoreCase(cursorStore)) {
            ok = false;
            builder.withDetail("query.cursor-store-type.expected", "jdbc");
        }
        String taskStore = resolveTaskStoreType();
        if (!"jdbc".equalsIgnoreCase(taskStore)
                && !("auto".equalsIgnoreCase(taskStore) && storageProperties.isJdbc())) {
            ok = false;
            builder.withDetail("task-concurrency.store-type.expected", "jdbc");
        }
        String sseBus = env("datawise.sse.bus-type", "in-memory");
        if (!"jdbc".equalsIgnoreCase(sseBus)) {
            ok = false;
            builder.withDetail("sse.bus-type.expected", "jdbc");
        }
        if (!"file".equalsIgnoreCase(checkpointStorage)) {
            ok = false;
            builder.withDetail("ai.analysis.checkpoint.storage.expected", "file");
        } else {
            builder.withDetail(
                    "ai.analysis.checkpoint.sharedVolume",
                    "required for multi-replica interrupt/resume (config/ai-checkpoints/)");
        }
        if (!ok) {
            return builder.down().withDetail("remediation", "docs/DEPLOYMENT.md#affinity").build();
        }
        return builder.build();
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
