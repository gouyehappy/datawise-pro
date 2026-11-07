package org.apache.datawise.backend.domain;

import java.util.List;

public record K8sNamespacesResultDto(
        List<K8sNamespaceDto> namespaces,
        int totalCount) {
}
