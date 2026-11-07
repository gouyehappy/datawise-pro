package org.apache.datawise.backend.sync.engine;

import org.apache.datawise.backend.domain.TableMigrationRequest;
import org.apache.datawise.backend.jdbc.support.MigrationWhereSupport;
import org.apache.datawise.backend.migration.MigrationOrderBySupport;

/** 迁移请求校验与 batch/throttle 参数规范化。 */
public final class TableMigrationRequestPolicy {

    static final int DEFAULT_BATCH_SIZE = 500;
    static final int MIN_BATCH_SIZE = 50;
    static final int MAX_BATCH_SIZE = 5000;
    static final int MAX_THROTTLE_MS = 5000;

    private TableMigrationRequestPolicy() {
    }

    public static void validate(TableMigrationRequest request) {
        if (request == null) {
            throw new IllegalArgumentException("Request is required");
        }
        if (request.sourceConnectionId() == null || request.sourceConnectionId().isBlank()) {
            throw new IllegalArgumentException("sourceConnectionId is required");
        }
        if (request.targetConnectionId() == null || request.targetConnectionId().isBlank()) {
            throw new IllegalArgumentException("targetConnectionId is required");
        }
        boolean hasSelect = request.sourceSelectSql() != null && !request.sourceSelectSql().isBlank();
        boolean hasTable = request.tableName() != null && !request.tableName().isBlank();
        if (!hasSelect && !hasTable) {
            throw new IllegalArgumentException("tableName or sourceSelectSql is required");
        }
        if (hasSelect && (request.targetTableName() == null || request.targetTableName().isBlank())) {
            throw new IllegalArgumentException("targetTableName is required when sourceSelectSql is set");
        }
        validateMode(request.mode(), request.watermarkColumn());
        MigrationOrderBySupport.validateOrderByColumns(request.orderByColumns());
        MigrationWhereSupport.validate(request.whereClause());
    }

    static void validateMode(String mode, String watermarkColumn) {
        String normalizedMode = mode == null || mode.isBlank() ? "FULL_APPEND" : mode.trim().toUpperCase();
        if (!"FULL_APPEND".equals(normalizedMode) && !"FULL_REPLACE".equals(normalizedMode) && !"INCR_APPEND".equals(normalizedMode)) {
            throw new IllegalArgumentException("mode is unsupported");
        }
        if ("INCR_APPEND".equals(normalizedMode)) {
            if (watermarkColumn == null || watermarkColumn.isBlank()) {
                throw new IllegalArgumentException("watermarkColumn is required for INCR_APPEND");
            }
            if (!watermarkColumn.trim().matches("[A-Za-z0-9_$.]+")) {
                throw new IllegalArgumentException("watermarkColumn is invalid");
            }
        }
    }

    public static int normalizeBatchSize(Integer batchSize) {
        return normalizeBatchSize(batchSize, DEFAULT_BATCH_SIZE);
    }

    public static int normalizeBatchSize(Integer batchSize, int defaultBatchSize) {
        int value = batchSize == null ? defaultBatchSize : batchSize;
        if (value < MIN_BATCH_SIZE || value > MAX_BATCH_SIZE) {
            throw new IllegalArgumentException(
                    "batchSize must be between " + MIN_BATCH_SIZE + " and " + MAX_BATCH_SIZE
            );
        }
        return value;
    }

    public static int normalizeThrottleMs(Integer throttleMs) {
        int value = throttleMs == null ? 0 : throttleMs;
        if (value < 0 || value > MAX_THROTTLE_MS) {
            throw new IllegalArgumentException("throttleMs must be between 0 and " + MAX_THROTTLE_MS);
        }
        return value;
    }
}
