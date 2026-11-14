package org.apache.datawise.backend.domain;

import java.util.List;

/** Sampled PK row-diff preview between source and target. */
public record TableMigrationRowDiffResult(
        String tableName,
        List<String> primaryKeyColumns,
        int sampledSourceRows,
        int insertCount,
        int updateCount,
        int unchangedCount,
        boolean truncated,
        String message,
        List<TableMigrationRowDiffItem> samples,
        String syncSql) {

    /** Backward-compatible constructor when sync SQL is unavailable. */
    public TableMigrationRowDiffResult(
            String tableName,
            List<String> primaryKeyColumns,
            int sampledSourceRows,
            int insertCount,
            int updateCount,
            int unchangedCount,
            boolean truncated,
            String message,
            List<TableMigrationRowDiffItem> samples
    ) {
        this(
                tableName,
                primaryKeyColumns,
                sampledSourceRows,
                insertCount,
                updateCount,
                unchangedCount,
                truncated,
                message,
                samples,
                null
        );
    }
}
