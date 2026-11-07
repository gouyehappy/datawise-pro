package org.apache.datawise.backend.lineage.model;

public record SourceRef(
        String connectionId,
        String database,
        String schema,
        String table,
        String column,
        String tableAlias,
        SourceKind kind
) {
    public String qualifiedColumn() {
        StringBuilder builder = new StringBuilder();
        if (schema != null && !schema.isBlank()) {
            builder.append(schema).append('.');
        }
        if (table != null && !table.isBlank()) {
            builder.append(table).append('.');
        }
        builder.append(column != null ? column : "?");
        return builder.toString();
    }
}
