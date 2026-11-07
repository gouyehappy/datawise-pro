package org.apache.datawise.backend.domain;

import java.util.List;

public record K8sConfigMapsResultDto(
        List<K8sConfigMapDto> configMaps,
        int totalCount) {
}
