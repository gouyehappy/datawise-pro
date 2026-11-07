package org.apache.datawise.backend.domain;

public record MigrationColumnTypeMapping(
        String columnName,
        String sourceType,
        String targetType,
        String warning) {
}
