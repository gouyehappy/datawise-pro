package org.apache.datawise.backend.domain;

import java.time.Instant;

public record SchemaDriftMonitorDto(
        String id,
        String name,
        String sourceConnectionId,
        String sourceDatabase,
        String targetConnectionId,
        String targetDatabase,
        String tablePattern,
        boolean enabled,
        Instant lastCheckedAt,
        int driftCount) {
}
