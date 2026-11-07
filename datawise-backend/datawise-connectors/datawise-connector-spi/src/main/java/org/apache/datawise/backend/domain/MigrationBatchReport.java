package org.apache.datawise.backend.domain;

import java.util.List;

/** Structured sync batch report for headless migration API (C-05). */
public record MigrationBatchReport(
        String mode,
        int totalTables,
        int successCount,
        int failedCount,
        long totalRowsMigrated,
        long durationMs,
        String overallStatus,
        List<TableMigrationResult> tables) {
}
