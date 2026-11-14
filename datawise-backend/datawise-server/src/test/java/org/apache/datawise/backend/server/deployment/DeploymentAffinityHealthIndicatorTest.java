package org.apache.datawise.backend.server.deployment;

import org.apache.datawise.backend.config.DeploymentAffinityProperties;
import org.apache.datawise.backend.config.StorageProperties;
import org.apache.datawise.taskconcurrency.spring.TaskConcurrencySpringProperties;
import org.junit.jupiter.api.Test;
import org.springframework.boot.actuate.health.Health;
import org.springframework.boot.actuate.health.Status;
import org.springframework.mock.env.MockEnvironment;

import static org.junit.jupiter.api.Assertions.assertEquals;

class DeploymentAffinityHealthIndicatorTest {

    @Test
    void nonCloudStaysUp() {
        MockEnvironment env = new MockEnvironment();
        env.setActiveProfiles("desktop");
        Health health = indicator(env, fileStorage(), new TaskConcurrencySpringProperties()).health();
        assertEquals(Status.UP, health.getStatus());
    }

    @Test
    void cloudWithMemoryH2IsDown() {
        MockEnvironment env = new MockEnvironment();
        env.setActiveProfiles("cloud");
        env.setProperty("datawise.sse.bus-type", "jdbc");
        env.setProperty("datawise.query.cursor-store-type", "jdbc");
        env.setProperty("datawise.ai.analysis.checkpoint.storage", "file");
        StorageProperties storage = new StorageProperties();
        storage.setBackend("jdbc");
        TaskConcurrencySpringProperties task = new TaskConcurrencySpringProperties();
        task.setStoreType(TaskConcurrencySpringProperties.StoreType.JDBC);
        Health health = indicator(env, storage, task).health();
        assertEquals(Status.DOWN, health.getStatus());
    }

    @Test
    void cloudWithInMemoryCursorIsDown() {
        MockEnvironment env = new MockEnvironment();
        env.setActiveProfiles("cloud");
        env.setProperty("datawise.sse.bus-type", "jdbc");
        env.setProperty("datawise.query.cursor-store-type", "in-memory");
        env.setProperty("datawise.ai.analysis.checkpoint.storage", "file");
        StorageProperties storage = new StorageProperties();
        storage.setBackend("jdbc");
        storage.getDatasource().setJdbcUrl("jdbc:postgresql://db:5432/datawise_meta");
        TaskConcurrencySpringProperties task = new TaskConcurrencySpringProperties();
        task.setStoreType(TaskConcurrencySpringProperties.StoreType.JDBC);
        Health health = indicator(env, storage, task).health();
        assertEquals(Status.DOWN, health.getStatus());
    }

    @Test
    void cloudWithMemoryCheckpointIsDown() {
        MockEnvironment env = new MockEnvironment();
        env.setActiveProfiles("cloud");
        env.setProperty("datawise.sse.bus-type", "jdbc");
        env.setProperty("datawise.query.cursor-store-type", "jdbc");
        env.setProperty("datawise.ai.analysis.checkpoint.storage", "memory");
        StorageProperties storage = new StorageProperties();
        storage.setBackend("jdbc");
        storage.getDatasource().setJdbcUrl("jdbc:postgresql://db:5432/datawise_meta");
        TaskConcurrencySpringProperties task = new TaskConcurrencySpringProperties();
        task.setStoreType(TaskConcurrencySpringProperties.StoreType.JDBC);
        Health health = indicator(env, storage, task).health();
        assertEquals(Status.DOWN, health.getStatus());
    }

    @Test
    void cloudWithDurableJdbcIsUp() {
        MockEnvironment env = new MockEnvironment();
        env.setActiveProfiles("cloud");
        env.setProperty("datawise.sse.bus-type", "jdbc");
        env.setProperty("datawise.query.cursor-store-type", "jdbc");
        env.setProperty("datawise.ai.analysis.checkpoint.storage", "file");
        StorageProperties storage = new StorageProperties();
        storage.setBackend("jdbc");
        storage.getDatasource().setJdbcUrl("jdbc:postgresql://db:5432/datawise_meta");
        TaskConcurrencySpringProperties task = new TaskConcurrencySpringProperties();
        task.setStoreType(TaskConcurrencySpringProperties.StoreType.JDBC);
        Health health = indicator(env, storage, task).health();
        assertEquals(Status.UP, health.getStatus());
        assertEquals(true, health.getDetails().get("stickyRequired"));
        assertEquals("jdbc", health.getDetails().get("cursorStoreType"));
    }

    private static DeploymentAffinityHealthIndicator indicator(
            MockEnvironment env,
            StorageProperties storage,
            TaskConcurrencySpringProperties task
    ) {
        return new DeploymentAffinityHealthIndicator(
                env, storage, new DeploymentAffinityProperties(), task);
    }

    private static StorageProperties fileStorage() {
        StorageProperties storage = new StorageProperties();
        storage.setBackend("file");
        return storage;
    }
}
