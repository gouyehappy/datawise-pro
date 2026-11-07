package org.apache.datawise.backend.domain;

public record TeamAuditLogDto(
        String id,
        String tenantId,
        Long actorUserId,
        String actorUserName,
        String action,
        String detail,
        String createdAt) {
}
