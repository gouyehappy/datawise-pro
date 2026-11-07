package org.apache.datawise.backend.domain;

import java.util.List;

/**
 * Per-connection/database slice of a release-gate evaluation (used for multi-env compare).
 */
public record DataQualityGateScopeResultDto(
        String connectionId,
        String database,
        boolean passed,
        int total,
        int failed,
        List<DataQualityRuleRunDto> results) {
}
