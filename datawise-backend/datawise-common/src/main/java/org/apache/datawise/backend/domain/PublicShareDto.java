package org.apache.datawise.backend.domain;

import java.time.Instant;

/** Public read-only share payload (no auth). */
public record PublicShareDto(
        String title,
        String kind,
        String payloadJson,
        Instant expiresAt) {
}
