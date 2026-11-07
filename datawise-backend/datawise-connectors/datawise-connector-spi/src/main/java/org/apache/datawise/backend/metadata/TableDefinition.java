package org.apache.datawise.backend.metadata;

import java.util.List;
import java.util.Map;

/**
 * 引擎无关表结构（类似 SeaTunnel CatalogTable / TableSchema）。
 */
public record TableDefinition(
        String catalog,
        String schema,
        String name,
        List<ColumnDefinition> columns,
        PrimaryKeyDefinition primaryKey,
        List<IndexDefinition> indexes,
        List<ForeignKeyDefinition> foreignKeys,
        Map<String, String> tableOptions,
        String comment) {

    public TableDefinition {
        columns = columns != null ? List.copyOf(columns) : List.of();
        indexes = indexes != null ? List.copyOf(indexes) : List.of();
        foreignKeys = foreignKeys != null ? List.copyOf(foreignKeys) : List.of();
        tableOptions = tableOptions != null ? Map.copyOf(tableOptions) : Map.of();
    }
}
