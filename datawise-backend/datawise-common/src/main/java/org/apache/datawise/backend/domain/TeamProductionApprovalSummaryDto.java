package org.apache.datawise.backend.domain;

public record TeamProductionApprovalSummaryDto(
        String id,
        String teamId,
        String connectionId,
        String connectionName,
        String database,
        String status,
        String requestedByUserName,
        Long requestedByUserId,
        String reviewedByUserName,
        String requestedAt,
        String reviewedAt) {
}
