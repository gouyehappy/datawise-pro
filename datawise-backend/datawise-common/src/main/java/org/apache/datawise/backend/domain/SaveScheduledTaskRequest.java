package org.apache.datawise.backend.domain;

import jakarta.validation.constraints.NotBlank;

public record SaveScheduledTaskRequest(
        String id,
        @NotBlank(message = "name is required") String name,
        String type,
        String cronExpression,
        String payloadJson,
        Boolean enabled) {
}
