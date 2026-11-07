package org.apache.datawise.backend.sync.engine;

import org.apache.datawise.backend.domain.TableMigrationBatchRequest;
import org.apache.datawise.backend.domain.TableMigrationBatchTableRequest;
import org.apache.datawise.backend.jdbc.support.MigrationWhereSupport;
import org.apache.datawise.backend.migration.MigrationOrderBySupport;

/** 批量迁移请求校验。 */
public final class TableMigrationBatchRequestPolicy {

    private TableMigrationBatchRequestPolicy() {
    }

    public static void validate(TableMigrationBatchRequest request) {
        validate(request, 50);
    }

    public static void validate(TableMigrationBatchRequest request, int maxBatchTables) {
        if (request == null) {
            throw new IllegalArgumentException("Request is required");
        }
        if (request.sourceConnectionId() == null || request.sourceConnectionId().isBlank()) {
            throw new IllegalArgumentException("sourceConnectionId is required");
        }
        if (request.targetConnectionId() == null || request.targetConnectionId().isBlank()) {
            throw new IllegalArgumentException("targetConnectionId is required");
        }
        if (request.tables() == null || request.tables().isEmpty()) {
            throw new IllegalArgumentException("tables is required");
        }
        if (request.tables().size() > maxBatchTables) {
            throw new IllegalArgumentException("tables exceeds max " + maxBatchTables);
        }
        for (TableMigrationBatchTableRequest table : request.tables()) {
            if (table == null || table.tableName() == null || table.tableName().isBlank()) {
                throw new IllegalArgumentException("tableName is required");
            }
        }
        TableMigrationRequestPolicy.validateMode(request.mode(), request.watermarkColumn());
        MigrationOrderBySupport.validateOrderByColumns(request.orderByColumns());
        MigrationWhereSupport.validate(request.whereClause());
        TableMigrationRequestPolicy.normalizeBatchSize(request.batchSize());
        TableMigrationRequestPolicy.normalizeThrottleMs(request.throttleMs());
    }
}
