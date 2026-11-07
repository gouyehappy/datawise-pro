package org.apache.datawise.backend.sync.api;

import org.apache.datawise.backend.domain.TableMigrationResult;

/** 批量迁移逐表进度回调（SSE 等场景）。 */
public interface TableMigrationProgressListener {

    /** preparing | creating_target | counting | truncating | copying | validating */
    String PHASE_PREPARING = "preparing";
    String PHASE_CREATING_TARGET = "creating_target";
    String PHASE_COUNTING = "counting";
    String PHASE_TRUNCATING = "truncating";
    String PHASE_COPYING = "copying";
    String PHASE_VALIDATING = "validating";

    void onTableStart(int tableIndex, int tableTotal, String tableName);

    void onTableResult(int tableIndex, int tableTotal, TableMigrationResult result);

    default void onBatchProgress(
            int tableIndex,
            int tableTotal,
            String tableName,
            long offset,
            long rowsMigrated,
            int batches
    ) {
    }

    /** 表级阶段变更（TRUNCATE / 建表 / 复制前准备等），便于 UI 显示卡住原因。 */
    default void onTablePhase(int tableIndex, int tableTotal, String tableName, String phase) {
    }
}
