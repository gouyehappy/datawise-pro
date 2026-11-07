package org.apache.datawise.backend.domain;

public record SlowSqlEntryDto(
        String id,
        String sql,
        String connectionId,
        long durationMs,
        Integer rowCount,
        String executedAt,
        boolean teamShared) {
}
