package org.apache.datawise.backend.domain;

import java.util.List;

public record K8sServicesResultDto(
        List<K8sServiceDto> services,
        int totalCount) {
}
