package org.apache.datawise.backend.domain;

import java.time.Instant;

public record ScheduledTaskDto(
        String id,
        String name,
        String type,
        String cronExpression,
        String payloadJson,
        boolean enabled,
        Instant lastRunAt,
        String lastRunStatus,
        String lastRunMessage,
        Instant createdAt,
        String orchestrationState,
        String orchestrationRef,
        Instant orchestrationCheckedAt,
        String orchestrationDetail) {
}
