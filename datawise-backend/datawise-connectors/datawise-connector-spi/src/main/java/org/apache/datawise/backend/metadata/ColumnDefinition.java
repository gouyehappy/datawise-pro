package org.apache.datawise.backend.metadata;

public record ColumnDefinition(
        String name,
        LogicalType type,
        boolean nullable,
        String defaultExpression,
        boolean autoIncrement,
        String comment,
        int ordinalPosition) {
}
