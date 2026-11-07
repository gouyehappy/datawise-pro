package org.apache.datawise.backend.domain;

import java.time.Instant;

public record OrchestrationStatusDto(
        String taskId,
        String taskName,
        String state,
        String ref,
        String detail,
        String statusUrl,
        int httpStatus,
        Instant checkedAt) {
}
