package org.apache.datawise.backend.domain;

import java.util.List;

public record NacosNamespacesResultDto(
        List<NacosNamespaceDto> namespaces,
        int totalCount) {
}
