package org.apache.datawise.backend.domain;

import java.util.List;

public record TableMigrationRequest(
        String sourceConnectionId,
        String sourceDatabase,
        String targetConnectionId,
        String targetDatabase,
        String tableName,
        String mode,
        String watermarkColumn,
        List<String> orderByColumns,
        String whereClause,
        Integer batchSize,
        Integer throttleMs,
        Boolean truncateTarget,
        Boolean createTargetIfMissing,
        String sourceSelectSql,
        String targetTableName,
        String conflictStrategy,
        /** Soft cap on rows copied; null = unlimited. */
        Integer maxRows) {

    public TableMigrationRequest withMaxRows(Integer maxRows) {
        return new TableMigrationRequest(
                sourceConnectionId,
                sourceDatabase,
                targetConnectionId,
                targetDatabase,
                tableName,
                mode,
                watermarkColumn,
                orderByColumns,
                whereClause,
                batchSize,
                throttleMs,
                truncateTarget,
                createTargetIfMissing,
                sourceSelectSql,
                targetTableName,
                conflictStrategy,
                maxRows);
    }
}
