package org.apache.datawise.backend.domain;

public record NacosInfoDto(
        String host,
        String baseUrl,
        boolean authenticated,
        int namespaceCount) {
}
