package org.apache.datawise.backend.domain;

import java.util.List;

public record K8sHelmReleasesResultDto(
        List<K8sHelmReleaseDto> releases,
        int totalCount) {
}
