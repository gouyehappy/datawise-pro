package org.apache.datawise.backend.domain;

public record KillSessionResultDto(
        String sessionId,
        String mode,
        String sql,
        boolean killed,
        String message) {
}
