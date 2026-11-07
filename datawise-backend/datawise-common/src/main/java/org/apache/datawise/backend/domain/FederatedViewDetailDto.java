package org.apache.datawise.backend.domain;

import org.apache.datawise.backend.model.FederatedViewSource;

import java.time.Instant;
import java.util.List;

public record FederatedViewDetailDto(
        String id,
        String name,
        String description,
        List<FederatedViewSource> sources,
        String sql,
        Instant createdAt,
        Instant updatedAt) {
}
