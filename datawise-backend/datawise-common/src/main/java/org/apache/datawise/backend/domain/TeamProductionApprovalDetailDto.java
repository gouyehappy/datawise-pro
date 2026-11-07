package org.apache.datawise.backend.domain;

public record TeamProductionApprovalDetailDto(
        String id,
        String teamId,
        String connectionId,
        String connectionName,
        String database,
        String sql,
        String status,
        String requestedByUserName,
        Long requestedByUserId,
        String reviewedByUserName,
        Long reviewedByUserId,
        String reviewComment,
        String executionError,
        String requestedAt,
        String reviewedAt) {
}
