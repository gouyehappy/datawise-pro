package org.apache.datawise.backend.domain;

/** SSE：单表分批迁移进度。 */
public record TableMigrationTableBatchProgressEvent(
        int tableIndex,
        int tableTotal,
        String tableName,
        long offset,
        long rowsMigrated,
        int batches) {
}
