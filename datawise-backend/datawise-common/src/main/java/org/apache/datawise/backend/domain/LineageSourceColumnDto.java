package org.apache.datawise.backend.domain;

public record LineageSourceColumnDto(
        String schema,
        String table,
        String column,
        String qualifiedName,
        String kind) {
}
