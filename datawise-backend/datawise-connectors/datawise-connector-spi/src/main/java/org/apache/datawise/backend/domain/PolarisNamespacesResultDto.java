package org.apache.datawise.backend.domain;

import java.util.List;

public record PolarisNamespacesResultDto(
        List<PolarisNamespaceDto> namespaces,
        int totalCount) {
}
