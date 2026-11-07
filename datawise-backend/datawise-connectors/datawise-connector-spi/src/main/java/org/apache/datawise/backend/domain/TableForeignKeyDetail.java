package org.apache.datawise.backend.domain;

public record TableForeignKeyDetail(
        String name,
        String columns,
        String referenceTable,
        String referenceColumns) {
}
