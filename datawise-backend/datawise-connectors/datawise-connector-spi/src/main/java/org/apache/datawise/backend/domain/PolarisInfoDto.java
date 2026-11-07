package org.apache.datawise.backend.domain;

public record PolarisInfoDto(
        String host,
        String baseUrl,
        int namespaceCount) {
}
