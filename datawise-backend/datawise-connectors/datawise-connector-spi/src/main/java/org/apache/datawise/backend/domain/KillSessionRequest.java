package org.apache.datawise.backend.domain;

import jakarta.validation.constraints.NotBlank;

public record KillSessionRequest(
        @NotBlank(message = "connectionId is required") String connectionId,
        String database,
        @NotBlank(message = "sessionId is required") String sessionId,
        String mode) {
}
