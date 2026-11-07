package org.apache.datawise.backend.domain;

/**
 * One primary ↔ reference rule pairing for a multi-env data-quality gate.
 */
public record DataQualityGatePairDto(
        String name,
        String primaryRuleId,
        /** Null when no same-name rule exists on the reference scope. */
        String referenceRuleId,
        boolean paired) {
}
