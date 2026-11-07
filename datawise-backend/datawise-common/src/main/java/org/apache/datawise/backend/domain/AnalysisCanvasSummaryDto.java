package org.apache.datawise.backend.domain;

import java.time.Instant;

public record AnalysisCanvasSummaryDto(
        String id,
        String title,
        String description,
        int parameterCount,
        Instant createdAt,
        Instant updatedAt) {
}
