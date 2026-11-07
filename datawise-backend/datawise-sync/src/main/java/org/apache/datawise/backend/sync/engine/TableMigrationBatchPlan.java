package org.apache.datawise.backend.sync.engine;

import org.apache.datawise.backend.domain.TableMigrationBatchRequest;
import org.apache.datawise.backend.domain.TableMigrationBatchTableRequest;

import java.util.List;

/** 批量迁移计划：表清单 + 共享策略。 */
public record TableMigrationBatchPlan(
        List<TableMigrationBatchTableRequest> tables,
        TableMigrationPolicy sharedPolicy
) {
    public static TableMigrationBatchPlan from(TableMigrationBatchRequest request, int defaultBatchSize) {
        return new TableMigrationBatchPlan(
                request.tables(),
                TableMigrationPolicy.sharedFrom(request, defaultBatchSize)
        );
    }

    public TableMigrationPolicy policyFor(TableMigrationBatchTableRequest table) {
        return sharedPolicy.forTable(table);
    }
}
