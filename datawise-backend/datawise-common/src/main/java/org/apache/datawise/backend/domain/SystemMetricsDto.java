package org.apache.datawise.backend.domain;

import java.util.List;

public record SystemMetricsDto(
        String collectedAt,
        String healthStatus,
        long uptimeMs,
        SystemJvmMetricsDto jvm,
        SystemDatawiseMetricsDto datawise,
        List<SystemJdbcPoolMetricsDto> jdbcPools) {
}
