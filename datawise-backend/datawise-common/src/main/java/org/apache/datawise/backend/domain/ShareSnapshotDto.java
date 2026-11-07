package org.apache.datawise.backend.domain;

import java.time.Instant;

/** Metadata for a share owned by the current user (no raw token). */
public record ShareSnapshotDto(
        String id,
        String title,
        String kind,
        Instant expiresAt,
        Instant createdAt,
        boolean revoked) {
}
