package org.apache.datawise.backend.server.deployment;

import org.apache.datawise.backend.config.AuthSecurityProperties;
import org.apache.datawise.backend.config.ConnectionProbeProperties;
import org.apache.datawise.backend.config.DatawiseQueryProperties;
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
    private final boolean requireManifestIntegrity;

    public DeploymentProfileService(
            Environment environment,
            StorageProperties storageProperties,
            AuthSecurityProperties authSecurityProperties,
            ConnectionProbeProperties connectionProbeProperties,
            DatawiseQueryProperties queryProperties,
            TaskConcurrencySpringProperties taskConcurrencyProperties,
            @Value("${datawise.connectors.require-manifest-integrity:true}") boolean requireManifestIntegrity
    ) {
        this.environment = environment;
        this.storageProperties = storageProperties;
        this.authSecurityProperties = authSecurityProperties;
        this.connectionProbeProperties = connectionProbeProperties;
        this.queryProperties = queryProperties;
        this.taskConcurrencyProperties = taskConcurrencyProperties;
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
        checks.add(check(
                "ai.analysis.checkpoint.storage",
                nullToEmpty(checkpointStorage),
                "file",
                "file".equalsIgnoreCase(checkpointStorage),
                localMode,
                "AI_PRODUCTION.md"
        ));
        // Process-local state cannot be auto-detected as sticky; always surface the constraint.
        checks.add(new DeploymentCheckDto(
                "runtime.process-local-affinity",
                "SQL sessions/cursors + AI analysis SSE (in-process)",
                "sticky session LB or single replica",
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
