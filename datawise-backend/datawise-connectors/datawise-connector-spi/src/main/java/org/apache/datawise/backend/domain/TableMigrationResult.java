package org.apache.datawise.backend.domain;

public record TableMigrationResult(
        String tableName,
        int rowsMigrated,
        int batches,
        long durationMs,
        String status,
        String message,
        Long sourceRowCount,
        Long targetRowCountBefore,
        Long targetRowCountAfter,
        String rowCountValidation) {
}
