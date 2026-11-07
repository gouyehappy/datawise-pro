package org.apache.datawise.backend.domain;

public record TeamSharedQueryUpdatedEvent(
        String teamId,
        String queryId,
        String updatedAt,
        Long updatedByUserId,
        String updatedByUserName) {
}
