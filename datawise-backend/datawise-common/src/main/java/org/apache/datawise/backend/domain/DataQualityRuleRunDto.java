package org.apache.datawise.backend.domain;

import java.time.Instant;

public record DataQualityRuleRunDto(
        String ruleId,
        String name,
        boolean blocking,
        String status,
        String message,
        Instant ranAt) {
}
