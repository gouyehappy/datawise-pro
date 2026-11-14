package org.apache.datawise.backend.domain;

import jakarta.validation.constraints.NotBlank;

public record CancelSqlExecutionRequest(
        @NotBlank(message = "sessionKey is required") String sessionKey,
        String mode,
        /** When set, cancel this precise query instead of the tab's latest execution. */
        String queryId
) {
    public CancelSqlExecutionRequest(String sessionKey, String mode) {
        this(sessionKey, mode, null);
    }
}
