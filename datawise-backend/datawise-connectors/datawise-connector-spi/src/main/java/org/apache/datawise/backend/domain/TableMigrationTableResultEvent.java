package org.apache.datawise.backend.domain;

/** SSE：单表迁移完成（成功或失败）。 */
public record TableMigrationTableResultEvent(
        int tableIndex,
        int tableTotal,
        TableMigrationResult result) {
}
