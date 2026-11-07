package org.apache.datawise.backend.domain;

public record SchemaDriftCompareRequest(
        String sourceConnectionId,
        String sourceDatabase,
        String targetConnectionId,
        String targetDatabase,
        String tablePattern) {
}
