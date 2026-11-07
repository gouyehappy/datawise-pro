package org.apache.datawise.backend.domain;

public record SchemaTableSummary(
        String tableName,
        Long rowCount,
        String engine,
        String collation,
        Long dataLength,
        String createTime,
        String comment) {
}
