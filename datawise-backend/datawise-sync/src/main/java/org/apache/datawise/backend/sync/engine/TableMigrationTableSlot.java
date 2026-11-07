package org.apache.datawise.backend.sync.engine;

/** 批量迁移中的单表槽位（序号与计时）。 */
public record TableMigrationTableSlot(
        int tableIndex,
        int tableTotal,
        long startedAtMillis
) {
    public static TableMigrationTableSlot single() {
        return new TableMigrationTableSlot(1, 1, System.currentTimeMillis());
    }

    public static TableMigrationTableSlot inBatch(int tableIndex, int tableTotal, long batchStartedAtMillis) {
        return new TableMigrationTableSlot(tableIndex, tableTotal, batchStartedAtMillis);
    }
}
