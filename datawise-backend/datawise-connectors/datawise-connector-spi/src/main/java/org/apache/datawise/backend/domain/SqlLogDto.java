package org.apache.datawise.backend.domain;

public record SqlLogDto(
        String id,
        String sql,
        String time,
        String duration,
        Long durationMs,
        String status,
        Integer rows,
        Boolean teamShared,
        String connectionId,
        String database,
        String projectId) {
}
