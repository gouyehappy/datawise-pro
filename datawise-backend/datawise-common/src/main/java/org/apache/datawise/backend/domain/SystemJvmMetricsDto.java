package org.apache.datawise.backend.domain;

public record SystemJvmMetricsDto(
        int availableProcessors,
        long heapUsedBytes,
        long heapMaxBytes,
        Double heapUsagePercent) {
}
