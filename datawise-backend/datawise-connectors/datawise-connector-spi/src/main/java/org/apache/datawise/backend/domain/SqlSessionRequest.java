package org.apache.datawise.backend.domain;

import jakarta.validation.constraints.NotBlank;

public record SqlSessionRequest(
        @NotBlank(message = "sessionKey is required") String sessionKey,
        @NotBlank(message = "connectionId is required") String connectionId,
        String database) {
}
