package org.apache.datawise.backend.domain;

import java.time.Instant;

public record FederatedViewSummaryDto(
        String id,
        String name,
        String description,
        int sourceCount,
        Instant updatedAt) {
}
