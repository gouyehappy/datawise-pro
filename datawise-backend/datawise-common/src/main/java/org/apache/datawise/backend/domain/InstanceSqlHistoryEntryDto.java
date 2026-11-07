package org.apache.datawise.backend.domain;

public record InstanceSqlHistoryEntryDto(
        String versionId,
        long savedAt,
        String preview,
        long sizeBytes) {
}
