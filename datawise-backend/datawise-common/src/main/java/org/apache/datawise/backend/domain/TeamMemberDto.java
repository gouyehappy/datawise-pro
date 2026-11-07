package org.apache.datawise.backend.domain;

public record TeamMemberDto(
        Long userId,
        String userName,
        String role,
        String joinedAt) {
}
