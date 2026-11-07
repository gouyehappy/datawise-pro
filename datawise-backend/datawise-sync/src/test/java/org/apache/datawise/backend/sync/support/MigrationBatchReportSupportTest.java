package org.apache.datawise.backend.sync.support;

import org.apache.datawise.backend.domain.MigrationBatchReport;
import org.apache.datawise.backend.domain.TableMigrationResult;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;

class MigrationBatchReportSupportTest {

    @Test
    void buildsSyncReportWithOverallStatus() {
        List<TableMigrationResult> results = List.of(
                new TableMigrationResult("a", 10, 1, 100, "success", null, 10L, 0L, 10L, "match"),
                new TableMigrationResult("b", 0, 0, 50, "failed", "timeout", null, null, null, null)
        );
        MigrationBatchReport report = MigrationBatchReportSupport.buildSyncReport(results, System.currentTimeMillis() - 200);
        assertEquals("sync", report.mode());
        assertEquals(2, report.totalTables());
        assertEquals(1, report.successCount());
        assertEquals(1, report.failedCount());
        assertEquals(10, report.totalRowsMigrated());
        assertEquals("partial", report.overallStatus());
        assertEquals(2, report.tables().size());
    }

    @Test
    void marksAllSuccessWhenNoFailures() {
        List<TableMigrationResult> results = List.of(
                new TableMigrationResult("a", 5, 1, 10, "success", null, 5L, 0L, 5L, "match")
        );
        MigrationBatchReport report = MigrationBatchReportSupport.buildSyncReport(results, System.currentTimeMillis());
        assertEquals("success", report.overallStatus());
        assertEquals(1, report.successCount());
        assertEquals(0, report.failedCount());
    }
}
