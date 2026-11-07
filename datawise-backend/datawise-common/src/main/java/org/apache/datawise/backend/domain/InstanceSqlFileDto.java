package org.apache.datawise.backend.domain;

public record InstanceSqlFileDto(
        String connectionId,
        String instanceName,
        String fileName,
        String relativePath,
        long modifiedAt,
        String preview) {
}
