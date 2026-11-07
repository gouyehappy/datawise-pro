package org.apache.datawise.backend.domain;

public record SystemJdbcPoolMetricsDto(
        String poolName,
        String connectionId,
        Integer activeConnections,
        Integer idleConnections,
        Integer pendingThreads,
        Integer maxConnections,
        Integer minConnections) {
}
