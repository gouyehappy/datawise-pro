package org.apache.datawise.backend.domain;

import java.util.List;

public record K8sPodsResultDto(
        List<K8sPodDto> pods,
        int totalCount) {
}
