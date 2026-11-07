package org.apache.datawise.backend.domain;

import java.time.Instant;
import java.util.List;
import java.util.Map;

/** API：迁移任务进度视图。 */
public record MigrationJobView(
        String id,
        String status,
        List<String> tablesPlanned,
        Map<String, MigrationTableCheckpoint> tables,
        List<TableMigrationResult> results,
        Instant createdAt,
        Instant updatedAt) {
}
