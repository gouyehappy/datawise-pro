package org.apache.datawise.backend.domain;

/** SSE：单表迁移开始。 */
public record TableMigrationTableStartEvent(int tableIndex, int tableTotal, String tableName) {
}
