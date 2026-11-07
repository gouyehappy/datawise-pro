package org.apache.datawise.backend.server.deployment;

import org.apache.datawise.backend.config.AuthSecurityProperties;
import org.apache.datawise.backend.config.ConnectionProbeProperties;
import org.apache.datawise.backend.config.DatawiseQueryProperties;
import org.apache.datawise.backend.config.StorageProperties;
import org.apache.datawise.backend.domain.DeploymentProfileDto;
import org.apache.datawise.taskconcurrency.spring.TaskConcurrencySpringProperties;
import org.junit.jupiter.api.Test;
import org.springframework.core.env.Environment;
import org.springframework.mock.env.MockEnvironment;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class DeploymentProfileServiceTest {

    @Test
    void marksDesktopDefaultsAsInfoNotWarn() {
        MockEnvironment env = new MockEnvironment();
        env.setActiveProfiles("desktop");
        DeploymentProfileDto profile = service(env).collect();

        assertEquals("desktop", profile.mode());
        assertTrue(profile.pythonSimulated());
        assertTrue(profile.checks().stream().anyMatch(c ->
                "ai.python.executor".equals(c.id()) && "info".equals(c.status())));
        assertTrue(profile.checks().stream().anyMatch(c ->
                "runtime.process-local-affinity".equals(c.id()) && "info".equals(c.status())));
        assertEquals(0, profile.warnCount());
    }

    @Test
    void marksServerGapsAsWarn() {
        StorageProperties storage = new StorageProperties();
        storage.setBackend("file");
        MockEnvironment env = new MockEnvironment();
        env.setProperty("datawise.ai.python.executor", "simulated");
        env.setProperty("datawise.ai.rag.vector-store", "none");
        env.setProperty("datawise.ai.analysis.semantic-check", "lenient");
        env.setProperty("datawise.ai.analysis.checkpoint.storage", "memory");
        env.setProperty("datawise.sse.bus-type", "in-memory");

        DeploymentProfileDto profile = new DeploymentProfileService(
                env,
                storage,
                new AuthSecurityProperties(),
                new ConnectionProbeProperties(),
                new DatawiseQueryProperties(),
                new TaskConcurrencySpringProperties(),
                false
        ).collect();

        assertEquals("default", profile.mode());
        assertTrue(profile.warnCount() >= 3);
        assertTrue(profile.checks().stream().anyMatch(c ->
                "storage.backend".equals(c.id()) && "warn".equals(c.status())));
        assertTrue(profile.checks().stream().anyMatch(c ->
                "sse.bus-type".equals(c.id()) && "warn".equals(c.status())));
        assertTrue(profile.checks().stream().anyMatch(c ->
                "ai.analysis.checkpoint.storage".equals(c.id()) && "warn".equals(c.status())));
    }

    @Test
    void marksMultiInstanceSseAndCheckpointOkWhenConfigured() {
        StorageProperties storage = new StorageProperties();
        storage.setBackend("jdbc");
        MockEnvironment env = new MockEnvironment();
        env.setProperty("datawise.ai.python.executor", "docker");
        env.setProperty("datawise.ai.rag.vector-store", "pgvector");
        env.setProperty("datawise.ai.analysis.semantic-check", "strict");
        env.setProperty("datawise.ai.analysis.checkpoint.storage", "file");
        env.setProperty("datawise.sse.bus-type", "jdbc");
        TaskConcurrencySpringProperties taskConcurrency = new TaskConcurrencySpringProperties();
        taskConcurrency.setStoreType(TaskConcurrencySpringProperties.StoreType.JDBC);

        DeploymentProfileDto profile = new DeploymentProfileService(
                env,
                storage,
                new AuthSecurityProperties(),
                new ConnectionProbeProperties(),
                new DatawiseQueryProperties(),
                taskConcurrency,
                true
        ).collect();

        assertTrue(profile.checks().stream().anyMatch(c ->
                "sse.bus-type".equals(c.id()) && "ok".equals(c.status())));
        assertTrue(profile.checks().stream().anyMatch(c ->
                "ai.analysis.checkpoint.storage".equals(c.id()) && "ok".equals(c.status())));
        assertTrue(profile.checks().stream().anyMatch(c ->
                "runtime.process-local-affinity".equals(c.id()) && "info".equals(c.status())));
    }

    private static DeploymentProfileService service(Environment environment) {
        return new DeploymentProfileService(
                environment,
                new StorageProperties(),
                new AuthSecurityProperties(),
                new ConnectionProbeProperties(),
                new DatawiseQueryProperties(),
                new TaskConcurrencySpringProperties(),
                false
        );
    }
}
