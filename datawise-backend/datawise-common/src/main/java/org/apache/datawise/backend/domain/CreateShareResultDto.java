package org.apache.datawise.backend.domain;

import java.time.Instant;

/** One-time create response including the raw share token. */
public record CreateShareResultDto(
        String id,
        String token,
        String title,
        String kind,
        Instant expiresAt,
        Instant createdAt,
        String path) {
}
