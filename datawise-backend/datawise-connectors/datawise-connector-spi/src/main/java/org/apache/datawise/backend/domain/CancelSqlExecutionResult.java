package org.apache.datawise.backend.domain;

public record CancelSqlExecutionResult(
        boolean cancelled,
        String mode,
        String message) {
}
