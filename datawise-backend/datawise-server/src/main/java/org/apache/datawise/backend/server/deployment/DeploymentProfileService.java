package org.apache.datawise.backend.server.deployment;

import org.apache.datawise.backend.config.AuthSecurityProperties;
import org.apache.datawise.backend.config.ConnectionProbeProperties;
import org.apache.datawise.backend.config.DatawiseQueryProperties;
import org.apache.datawise.backend.config.DeploymentAffinityProperties;
import org.apache.datawise.backend.config.StorageProperties;
import org.apache.datawise.backend.domain.DeploymentProfileDto;
import org.apache.datawise.backend.domain.DeploymentProfileDto.DeploymentCheckDto;
import org.apache.datawise.taskconcurrency.spring.TaskConcurrencySpringProperties;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;

/**
 * Compares live config against team-server recommendations in {@code docs/DEPLOYMENT.md}.
 * AI checks read {@link Environment} so the server module does not hard-depend on datawise-ai types.
 */
@Service
public class DeploymentProfileService {

    private final Environment environment;
    private final StorageProperties storageProperties;
    private final AuthSecurityProperties authSecurityProperties;
    private final ConnectionProbeProperties connectionProbeProperties;
    private final DatawiseQueryProperties queryProperties;
    private final TaskConcurrencySpringProperties taskConcurrencyProperties;
    private final DeploymentAffinityProperties deploymentAffinityProperties;
    private final boolean requireManifestIntegrity;

    public DeploymentProfileService(
            Environment environment,
            StorageProperties storageProperties,
            AuthSecurityProperties authSecurityProperties,
            ConnectionProbeProperties connectionProbeProperties,
            DatawiseQueryProperties queryProperties,
            TaskConcurrencySpringProperties taskConcurrencyProperties,
            DeploymentAffinityProperties deploymentAffinityProperties,
            @Value("${datawise.connectors.require-manifest-integrity:true}") boolean requireManifestIntegrity
    ) {
        this.environment = environment;
        this.storageProperties = storageProperties;
        this.authSecurityProperties = authSecurityProperties;
        this.connectionProbeProperties = connectionProbeProperties;
        this.queryProperties = queryProperties;
        this.taskConcurrencyProperties = taskConcurrencyProperties;
        this.deploymentAffinityProperties = deploymentAffinityProperties != null
                ? deploymentAffinityProperties
                : new DeploymentAffinityProperties();
        this.requireManifestIntegrity = requireManifestIntegrity;
    }

    public DeploymentProfileDto collect() {
        List<String> profiles = Arrays.stream(environment.getActiveProfiles())
                .map(p -> p == null ? "" : p.trim().toLowerCase(Locale.ROOT))
                .filter(p -> !p.isEmpty())
                .toList();
        String mode = resolveMode(profiles);
        boolean localMode = "dev".equals(mode) || "desktop".equals(mode);

        List<DeploymentCheckDto> checks = new ArrayList<>();
        checks.add(check(
                "storage.backend",
                storageProperties.getBackend(),
                "jdbc",
                storageProperties.isJdbc(),
                localMode,
                "DEPLOYMENT.md#jdbc"
        ));
        boolean durableMeta = storageProperties.isJdbc() && !storageProperties.isMemoryH2Metadata();
        checks.add(check(
                "storage.datasource.durable",
                storageProperties.isJdbc()
                        ? (storageProperties.isMemoryH2Metadata() ? "h2:mem (ephemeral)" : "durable")
                        : "n/a (file)",
                "durable JDBC (not h2:mem) on cloud/server",
                durableMeta || localMode,
                localMode,
                "DEPLOYMENT.md#jdbc"
        ));

        String vectorStore = env("datawise.ai.rag.vector-store", "none");
        checks.add(check(
                "ai.rag.vector-store",
                nullToEmpty(vectorStore),
                "pgvector",
                "pgvector".equalsIgnoreCase(vectorStore),
                localMode,
                "AI_PRODUCTION.md"
        ));
        String semanticCheck = env("datawise.ai.analysis.semantic-check", "strict");
        checks.add(check(
                "ai.analysis.semantic-check",
                nullToEmpty(semanticCheck),
                "strict",
                "strict".equalsIgnoreCase(semanticCheck),
                localMode,
                "AI_PRODUCTION.md"
        ));
        String pythonExecutor = env("datawise.ai.python.executor", "simulated");
        boolean pythonSimulated = "simulated".equalsIgnoreCase(pythonExecutor);
        boolean pythonDockerOrK8s = "docker".equalsIgnoreCase(pythonExecutor)
                || "k8s".equalsIgnoreCase(pythonExecutor)
                || "kubernetes".equalsIgnoreCase(pythonExecutor);
        checks.add(check(
                "ai.python.executor",
                nullToEmpty(pythonExecutor),
                "docker",
                !pythonSimulated && pythonDockerOrK8s,
                localMode,
                "AI_PRODUCTION.md"
        ));
        checks.add(check(
                "security.auth.require-authentication",
                String.valueOf(authSecurityProperties.isRequireAuthentication()),
                "true",
                authSecurityProperties.isRequireAuthentication(),
                false,
                "DEPLOYMENT.md#auth"
        ));
        checks.add(check(
                "security.connection-probe.allow-private-networks",
                String.valueOf(connectionProbeProperties.isAllowPrivateNetworks()),
                "false (public SaaS) / true (private LAN)",
                !connectionProbeProperties.isAllowPrivateNetworks() || localMode,
                localMode,
                "DEPLOYMENT.md"
        ));
        checks.add(check(
                "connectors.require-manifest-integrity",
                String.valueOf(requireManifestIntegrity),
                "true",
                requireManifestIntegrity,
                localMode,
                "DEPLOYMENT.md"
        ));
        int maxRows = queryProperties.getMaxResultRows();
        checks.add(check(
                "query.max-result-rows",
                String.valueOf(maxRows),
                "10000 (or stricter; not 0)",
                maxRows > 0,
                false,
                "DEPLOYMENT.md"
        ));
        int timeoutSeconds = queryProperties.getTimeoutSeconds();
        checks.add(check(
                "query.timeout-seconds",
                String.valueOf(timeoutSeconds),
                "> 0 (e.g. 300)",
                timeoutSeconds > 0,
                localMode,
                "DEPLOYMENT.md"
        ));
        int maxConcurrentGlobal = queryProperties.getMaxConcurrentGlobal();
        checks.add(check(
                "query.max-concurrent-global",
                String.valueOf(maxConcurrentGlobal),
                "> 0 (e.g. 64)",
                maxConcurrentGlobal > 0,
                localMode,
                "DEPLOYMENT.md"
        ));
        int maxConcurrentPerUser = queryProperties.getMaxConcurrentPerUser();
        checks.add(check(
                "query.max-concurrent-per-user",
                String.valueOf(maxConcurrentPerUser),
                "> 0 (e.g. 4–8)",
                maxConcurrentPerUser > 0,
                localMode,
                "DEPLOYMENT.md"
        ));
        String storeType = taskConcurrencyProperties.getStoreType() != null
                ? taskConcurrencyProperties.getStoreType().name().toLowerCase(Locale.ROOT)
                : "auto";
        boolean storeOk = taskConcurrencyProperties.getStoreType() == TaskConcurrencySpringProperties.StoreType.JDBC
                || (taskConcurrencyProperties.getStoreType() == TaskConcurrencySpringProperties.StoreType.AUTO
                && storageProperties.isJdbc());
        checks.add(check(
                "task-concurrency.store-type",
                storeType,
                "jdbc (or auto + storage.jdbc)",
                storeOk,
                localMode,
                "DEPLOYMENT.md"
        ));
        String cursorStoreType = queryProperties.getCursorStoreType();
        checks.add(check(
                "query.cursor-store-type",
                nullToEmpty(cursorStoreType),
                "jdbc (shared dw_sql_cursors; requires storage.jdbc)",
                queryProperties.isJdbcCursorStore() && storageProperties.isJdbc(),
                localMode,
                "DEPLOYMENT.md#affinity"
        ));
        String sseBusType = env("datawise.sse.bus-type", "in-memory");
        checks.add(check(
                "sse.bus-type",
                nullToEmpty(sseBusType),
                "jdbc (multi-instance Migration / shared Query SSE)",
                "jdbc".equalsIgnoreCase(sseBusType),
                localMode,
                "DEPLOYMENT.md#affinity"
        ));
        // application.yml defaults to file; memory loses interrupt resume on restart
        String checkpointStorage = env("datawise.ai.analysis.checkpoint.storage", "file");
        boolean checkpointFile = "file".equalsIgnoreCase(checkpointStorage);
        checks.add(check(
                "ai.analysis.checkpoint.storage",
                nullToEmpty(checkpointStorage),
                "file (+ shared volume for multi-replica resume)",
                checkpointFile,
                localMode,
                "DEPLOYMENT.md#affinity"
        ));
        if (checkpointFile && !localMode) {
            checks.add(new DeploymentCheckDto(
                    "ai.analysis.checkpoint.shared-volume",
                    "file saver under config/ai-checkpoints/",
                    "shared PVC/NFS across replicas (else resume sticks to one node)",
                    "info",
                    "DEPLOYMENT.md#affinity"
            ));
        }
        String affinityMode = deploymentAffinityProperties.getAffinityMode().name().toLowerCase(Locale.ROOT);
        checks.add(check(
                "deployment.affinity-mode",
                affinityMode,
                "sticky (multi-replica LB) or single",
                true,
                localMode,
                "DEPLOYMENT.md#affinity"
        ));
        // Process-local: console TX + live AI SSE (cursors OK when jdbc).
        String affinityRecommended = deploymentAffinityProperties.stickyRequired()
                ? "sticky session LB (affinity-mode=sticky)"
                : "single replica (affinity-mode=single)";
        String processLocalCurrent = queryProperties.isJdbcCursorStore()
                ? "SQL sessions + live AI SSE (in-process); cursors=jdbc; stickyRequired="
                + deploymentAffinityProperties.stickyRequired()
                : "SQL sessions/cursors + live AI SSE (in-process); stickyRequired="
                + deploymentAffinityProperties.stickyRequired();
        checks.add(new DeploymentCheckDto(
                "runtime.process-local-affinity",
                processLocalCurrent,
                affinityRecommended,
                "info",
                "DEPLOYMENT.md#affinity"
        ));

        int ok = 0;
        int warn = 0;
        int info = 0;
        for (DeploymentCheckDto check : checks) {
            switch (check.status()) {
                case "ok" -> ok++;
                case "warn" -> warn++;
                default -> info++;
            }
        }
        return new DeploymentProfileDto(profiles, mode, checks, ok, warn, info, pythonSimulated);
    }

    private String env(String key, String defaultValue) {
        String value = environment.getProperty(key);
        return value == null || value.isBlank() ? defaultValue : value.trim();
    }

    private static String resolveMode(List<String> profiles) {
        if (profiles.stream().anyMatch(p -> p.equals("desktop"))) {
            return "desktop";
        }
        if (profiles.stream().anyMatch(p -> p.equals("dev"))) {
            return "dev";
        }
        if (profiles.isEmpty()) {
            return "default";
        }
        return "server";
    }

    private static DeploymentCheckDto check(
            String id,
            String current,
            String recommended,
            boolean matchesRecommended,
            boolean localMode,
            String docsHint
    ) {
        String status;
        if (matchesRecommended) {
            status = "ok";
        } else if (localMode) {
            status = "info";
        } else {
            status = "warn";
        }
        return new DeploymentCheckDto(id, current, recommended, status, docsHint);
    }

    private static String nullToEmpty(String value) {
        return value == null || value.isBlank() ? "" : value.trim();
    }
}
