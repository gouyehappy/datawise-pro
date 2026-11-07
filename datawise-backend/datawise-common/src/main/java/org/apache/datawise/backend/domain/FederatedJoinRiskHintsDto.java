package org.apache.datawise.backend.domain;

/**
 * Proactive federated JOIN risk summary for the editor (pushdown / residual / equality ON).
 */
public record FederatedJoinRiskHintsDto(
        boolean parseable,
        String parseError,
        int joinStepCount,
        int pushedFilterCount,
        int residualFilterCount,
        boolean equalityJoin,
        boolean truncationRiskElevated,
        int defaultMaxRows,
        int hardMaxRows) {
}
