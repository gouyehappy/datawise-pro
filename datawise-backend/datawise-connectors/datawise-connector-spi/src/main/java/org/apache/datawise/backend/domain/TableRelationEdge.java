package org.apache.datawise.backend.domain;

/** 外键关系边：source 列引用 target 列。 */
public record TableRelationEdge(
        String constraintName,
        String sourceTable,
        String sourceColumns,
        String targetTable,
        String targetColumns) {
}
