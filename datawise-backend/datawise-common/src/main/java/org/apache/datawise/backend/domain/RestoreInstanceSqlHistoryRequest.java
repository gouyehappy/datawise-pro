package org.apache.datawise.backend.domain;

public record RestoreInstanceSqlHistoryRequest(
        String connectionId,
        String instanceName,
        String fileName,
        String versionId) {
}
