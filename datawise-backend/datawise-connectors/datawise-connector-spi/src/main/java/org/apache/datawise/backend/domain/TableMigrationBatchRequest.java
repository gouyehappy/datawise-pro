package org.apache.datawise.backend.domain;

import java.util.List;

public record TableMigrationBatchRequest(
        String sourceConnectionId,
        String sourceDatabase,
        String targetConnectionId,
        String targetDatabase,
        List<TableMigrationBatchTableRequest> tables,
        String mode,
        String watermarkColumn,
        List<String> orderByColumns,
        String whereClause,
        Integer batchSize,
        Integer throttleMs,
        Boolean truncateTarget,
        String jobId,
        String resumeJobId,
        String conflictStrategy,
        /** Soft cap on rows copied per table; null = unlimited. */
        Integer maxRows) {

    public TableMigrationBatchRequest withMaxRows(Integer maxRows) {
        return new TableMigrationBatchRequest(
                sourceConnectionId,
                sourceDatabase,
                targetConnectionId,
                targetDatabase,
                tables,
                mode,
                watermarkColumn,
                orderByColumns,
                whereClause,
                batchSize,
                throttleMs,
                truncateTarget,
                jobId,
                resumeJobId,
                conflictStrategy,
                maxRows);
    }
}
