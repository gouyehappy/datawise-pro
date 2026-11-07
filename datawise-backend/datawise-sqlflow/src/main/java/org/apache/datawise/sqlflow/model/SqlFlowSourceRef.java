package org.apache.datawise.sqlflow.model;

import java.util.Objects;

public record SqlFlowSourceRef(
        String database,
        String schema,
        String table,
        String column,
        String tableAlias
) {
    public SqlFlowSourceRef {
        database = normalize(database);
        schema = normalize(schema);
        table = normalize(table);
        column = normalize(column);
        tableAlias = normalize(tableAlias);
    }

    private static String normalize(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    public String displayTable() {
        if (table == null) {
            return null;
        }
        if (schema != null && !schema.isBlank()) {
            return schema + "." + table;
        }
        return table;
    }

    public boolean samePhysicalTable(SqlFlowSourceRef other) {
        if (other == null) {
            return false;
        }
        return Objects.equals(normalizeId(database), normalizeId(other.database))
                && Objects.equals(normalizeId(schema), normalizeId(other.schema))
                && Objects.equals(normalizeId(table), normalizeId(other.table));
    }

    private static String normalizeId(String value) {
        return value == null ? null : value.trim().toLowerCase();
    }
}
