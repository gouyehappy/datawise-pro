package org.apache.datawise.backend.sse;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.time.Duration;

/**
 * SSE shared bus settings ({@code datawise.sse.*}).
 */
@ConfigurationProperties(prefix = "datawise.sse")
public class SseProperties {

    /**
     * Bus backend: {@code in-memory} (default, desktop-safe) or {@code jdbc}
     * (requires {@code datawise.storage.backend=jdbc} + metadata DataSource).
     */
    private BusType busType = BusType.IN_MEMORY;

    /** Optional override for publish origin id; empty = auto host:pid / UUID. */
    private String instanceId = "";

    private final Jdbc jdbc = new Jdbc();

    public enum BusType {
        IN_MEMORY,
        JDBC
    }

    public static class Jdbc {

        private Duration pollInterval = Duration.ofMillis(500);
        private Duration retention = Duration.ofMinutes(5);

        public Duration getPollInterval() {
            return pollInterval;
        }

        public void setPollInterval(Duration pollInterval) {
            this.pollInterval = pollInterval;
        }

        public Duration getRetention() {
            return retention;
        }

        public void setRetention(Duration retention) {
            this.retention = retention;
        }
    }

    public BusType getBusType() {
        return busType;
    }

    public void setBusType(BusType busType) {
        this.busType = busType;
    }

    public String getInstanceId() {
        return instanceId;
    }

    public void setInstanceId(String instanceId) {
        this.instanceId = instanceId;
    }

    public Jdbc getJdbc() {
        return jdbc;
    }
}
