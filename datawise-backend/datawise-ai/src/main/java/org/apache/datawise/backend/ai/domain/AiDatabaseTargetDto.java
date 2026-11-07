package org.apache.datawise.backend.ai.domain;

public record AiDatabaseTargetDto(
        String connectionId,
        String connectionLabel,
        String database,
        String databaseLabel,
        String tableLabel,
        String dbType
) {
}
