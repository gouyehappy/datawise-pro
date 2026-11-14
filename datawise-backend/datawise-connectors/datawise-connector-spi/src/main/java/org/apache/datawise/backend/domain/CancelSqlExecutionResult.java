package org.apache.datawise.backend.domain;

public record CancelSqlExecutionResult(
        boolean cancelled,
        String mode,
        String message,
        String queryId
) {
    public CancelSqlExecutionResult(boolean cancelled, String mode, String message) {
        this(cancelled, mode, message, null);
    }
}
