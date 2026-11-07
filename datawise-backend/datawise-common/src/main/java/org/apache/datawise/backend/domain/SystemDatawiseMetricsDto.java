package org.apache.datawise.backend.domain;

public record SystemDatawiseMetricsDto(
        int jdbcPoolsActive,
        int explorerSchemaSessionsActive,
        long explorerLoadChildrenNotModifiedShortCircuit,
        long explorerLoadChildrenNotModifiedAfterLoad,
        long explorerLoadChildrenModified) {
}
