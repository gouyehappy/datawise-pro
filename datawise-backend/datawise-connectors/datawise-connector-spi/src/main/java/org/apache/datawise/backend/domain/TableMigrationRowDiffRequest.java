package org.apache.datawise.backend.domain;

/** Request a sampled primary-key row diff between source and target tables. */
public record TableMigrationRowDiffRequest(
        String sourceConnectionId,
        String sourceDatabase,
        String targetConnectionId,
        String targetDatabase,
        String tableName,
        String whereClause,
        Integer sampleLimit) {
}
