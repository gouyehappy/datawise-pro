package org.apache.datawise.backend.domain;

import java.util.List;

public record TableMigrationBatchResult(String jobId, List<TableMigrationResult> results) {

    public TableMigrationBatchResult(List<TableMigrationResult> results) {
        this(null, results);
    }
}
