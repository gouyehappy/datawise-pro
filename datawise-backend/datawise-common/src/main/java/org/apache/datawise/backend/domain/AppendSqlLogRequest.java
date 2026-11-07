package org.apache.datawise.backend.domain;

public record AppendSqlLogRequest(
        String sql,
        String time,
        String duration,
        Long durationMs,
        String status,
        Integer rows,
        String connectionId,
        String database) {
}
