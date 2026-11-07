package org.apache.datawise.backend.domain;

public record NacosNamespaceDto(
        String namespace,
        String namespaceShowName,
        String namespaceDesc,
        int quota,
        int configCount,
        int type) {
}
