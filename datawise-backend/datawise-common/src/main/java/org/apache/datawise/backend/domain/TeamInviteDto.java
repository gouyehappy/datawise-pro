package org.apache.datawise.backend.domain;

public record TeamInviteDto(
        String id,
        Long userId,
        String userName,
        String status,
        String requestedAt) {
}
