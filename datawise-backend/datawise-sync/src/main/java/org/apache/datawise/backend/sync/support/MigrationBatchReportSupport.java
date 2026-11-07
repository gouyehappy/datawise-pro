package org.apache.datawise.backend.sync.support;

import org.apache.datawise.backend.domain.MigrationBatchReport;
import org.apache.datawise.backend.domain.TableMigrationResult;

import java.util.List;

public final class MigrationBatchReportSupport {

    private MigrationBatchReportSupport() {
    }

    public static MigrationBatchReport buildSyncReport(List<TableMigrationResult> results, long startedAtMs) {
        List<TableMigrationResult> tables = results != null ? List.copyOf(results) : List.of();
        int successCount = 0;
        int failedCount = 0;
        long totalRowsMigrated = 0;
        for (TableMigrationResult result : tables) {
            if ("success".equalsIgnoreCase(result.status())) {
                successCount++;
            } else if ("failed".equalsIgnoreCase(result.status())) {
                failedCount++;
            }
            totalRowsMigrated += Math.max(0, result.rowsMigrated());
        }
        long durationMs = Math.max(0, System.currentTimeMillis() - startedAtMs);
        String overallStatus = resolveOverallStatus(successCount, failedCount, tables.size());
        return new MigrationBatchReport(
                "sync",
                tables.size(),
                successCount,
                failedCount,
                totalRowsMigrated,
                durationMs,
                overallStatus,
                tables
        );
    }

    private static String resolveOverallStatus(int successCount, int failedCount, int totalTables) {
        if (totalTables == 0) {
            return "failed";
        }
        if (failedCount == 0) {
            return "success";
        }
        if (successCount > 0) {
            return "partial";
        }
        return "failed";
    }
}
