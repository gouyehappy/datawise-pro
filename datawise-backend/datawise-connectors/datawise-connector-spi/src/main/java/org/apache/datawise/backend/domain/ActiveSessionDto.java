package org.apache.datawise.backend.domain;

public record ActiveSessionDto(
        String sessionId,
        String user,
        String host,
        String database,
        String state,
        String command,
        long durationSeconds,
        String sql) {
}
