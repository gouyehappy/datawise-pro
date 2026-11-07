package org.apache.datawise.backend.domain;

import jakarta.validation.constraints.NotBlank;

public record CancelSqlExecutionRequest(
        @NotBlank(message = "sessionKey is required") String sessionKey,
        String mode) {
}
