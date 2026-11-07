package org.apache.datawise.backend.domain;

import jakarta.validation.constraints.NotBlank;

public record SaveSchemaDriftMonitorRequest(
        String id,
        @NotBlank(message = "name is required") String name,
        @NotBlank(message = "sourceConnectionId is required") String sourceConnectionId,
        String sourceDatabase,
        @NotBlank(message = "targetConnectionId is required") String targetConnectionId,
        String targetDatabase,
        String tablePattern,
        Boolean enabled) {
}
