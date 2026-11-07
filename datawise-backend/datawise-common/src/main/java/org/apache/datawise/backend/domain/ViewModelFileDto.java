package org.apache.datawise.backend.domain;

public record ViewModelFileDto(
        String connectionId,
        String instanceName,
        String name,
        String fileName,
        String relativePath,
        long modifiedAt,
        String preview) {
}
