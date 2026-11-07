package org.apache.datawise.backend.domain;

public record TeamJoinRequestDto(
        String teamId,
        String teamName,
        String status,
        String requestedAt) {
}
