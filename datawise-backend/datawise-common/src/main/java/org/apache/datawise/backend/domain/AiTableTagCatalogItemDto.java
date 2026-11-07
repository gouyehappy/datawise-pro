package org.apache.datawise.backend.domain;

public record AiTableTagCatalogItemDto(
        String connectionId,
        String connectionName,
        String database,
        String tableName) {
}
