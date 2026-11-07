package org.apache.datawise.backend.domain;

/** SSE：单表迁移阶段（批次复制前的准备/DDL 等）。 */
public record TableMigrationTablePhaseEvent(
        int tableIndex,
        int tableTotal,
        String tableName,
        String phase) {
}
