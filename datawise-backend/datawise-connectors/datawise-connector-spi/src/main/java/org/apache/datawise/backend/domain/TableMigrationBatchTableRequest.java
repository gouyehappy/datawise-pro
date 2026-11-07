package org.apache.datawise.backend.domain;

import java.util.List;

public record TableMigrationBatchTableRequest(
        String tableName,
        Boolean createTargetIfMissing) {
}
