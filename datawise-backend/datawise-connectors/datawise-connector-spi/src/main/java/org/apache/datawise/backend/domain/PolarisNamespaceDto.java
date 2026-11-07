package org.apache.datawise.backend.domain;

public record PolarisNamespaceDto(
        String name,
        String comment,
        String owners,
        String ctime,
        String mtime) {
}
