package org.apache.datawise.backend.domain;

import java.util.List;

public record SqlExecutionStatsDto(
        List<SlowSqlEntryDto> slowQueries,
        List<SqlStatsTrendPointDto> trend,
        long totalRuns,
        long avgDurationMs,
        long slowThresholdMs,
        int days) {
}
