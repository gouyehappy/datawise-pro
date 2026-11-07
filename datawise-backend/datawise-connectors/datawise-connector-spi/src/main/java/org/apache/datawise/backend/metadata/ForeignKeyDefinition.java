package org.apache.datawise.backend.metadata;

import java.util.List;

public record ForeignKeyDefinition(
        String name,
        List<String> columnNames,
        String referencedTable,
        List<String> referencedColumns,
        String onDelete,
        String onUpdate) {
}
