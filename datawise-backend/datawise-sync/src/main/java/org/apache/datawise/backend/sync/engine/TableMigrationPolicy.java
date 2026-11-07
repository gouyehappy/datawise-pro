package org.apache.datawise.backend.sync.engine;

import org.apache.datawise.backend.domain.TableMigrationBatchRequest;
import org.apache.datawise.backend.domain.TableMigrationBatchTableRequest;
import org.apache.datawise.backend.domain.TableMigrationRequest;
import org.apache.datawise.backend.migration.MigrationConflictStrategy;

import java.util.List;

/** 单表迁移策略：模式、过滤条件与批次参数。 */
public record TableMigrationPolicy(
        String mode,
        String watermarkColumn,
        List<String> orderByColumns,
        String whereClause,
        int batchSize,
        int throttleMs,
        boolean truncateTarget,
        boolean createTargetIfMissing,
        String sourceSelectSql,
        String targetTableName,
        String conflictStrategy,
        int maxRows
) {
    public static TableMigrationPolicy from(TableMigrationRequest request, int defaultBatchSize) {
        return new TableMigrationPolicy(
                request.mode(),
                request.watermarkColumn(),
                request.orderByColumns(),
                request.whereClause(),
                TableMigrationRequestPolicy.normalizeBatchSize(request.batchSize(), defaultBatchSize),
                TableMigrationRequestPolicy.normalizeThrottleMs(request.throttleMs()),
                Boolean.TRUE.equals(request.truncateTarget()),
                Boolean.TRUE.equals(request.createTargetIfMissing()),
                request.sourceSelectSql(),
                request.targetTableName(),
                request.conflictStrategy(),
                normalizeMaxRows(request.maxRows())
        );
    }

    public String physicalTargetTable(String logicalTableName) {
        if (targetTableName != null && !targetTableName.isBlank()) {
            return targetTableName.trim();
        }
        return logicalTableName;
    }

    public boolean usesCustomSelect() {
        return sourceSelectSql != null && !sourceSelectSql.isBlank();
    }

    public boolean usesPkUpsert() {
        return MigrationConflictStrategy.isUpsertMode(mode);
    }

    public String resolvedConflictStrategy() {
        if (!usesPkUpsert()) {
            return null;
        }
        return MigrationConflictStrategy.normalize(conflictStrategy);
    }

    public static TableMigrationPolicy sharedFrom(TableMigrationBatchRequest request, int defaultBatchSize) {
        return new TableMigrationPolicy(
                request.mode(),
                request.watermarkColumn(),
                request.orderByColumns(),
                request.whereClause(),
                TableMigrationRequestPolicy.normalizeBatchSize(request.batchSize(), defaultBatchSize),
                TableMigrationRequestPolicy.normalizeThrottleMs(request.throttleMs()),
                Boolean.TRUE.equals(request.truncateTarget()),
                false,
                null,
                null,
                request.conflictStrategy(),
                normalizeMaxRows(request.maxRows())
        );
    }

    public TableMigrationPolicy forTable(TableMigrationBatchTableRequest table) {
        return withCreateTargetIfMissing(Boolean.TRUE.equals(table.createTargetIfMissing()));
    }

    public TableMigrationPolicy withCreateTargetIfMissing(boolean createTargetIfMissing) {
        return new TableMigrationPolicy(
                mode,
                watermarkColumn,
                orderByColumns,
                whereClause,
                batchSize,
                throttleMs,
                truncateTarget,
                createTargetIfMissing,
                sourceSelectSql,
                targetTableName,
                conflictStrategy,
                maxRows
        );
    }

    private static int normalizeMaxRows(Integer maxRows) {
        if (maxRows == null || maxRows <= 0) {
            return 0;
        }
        return maxRows;
    }
}
