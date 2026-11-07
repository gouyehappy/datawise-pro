package org.apache.datawise.backend.lineage.model;

public record FederatedLineageSource(
        String alias,
        String connectionId,
        String database,
        String dbType
) {
}
