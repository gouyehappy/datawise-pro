package org.apache.datawise.backend.domain;

import java.util.List;

public record K8sApplyResultDto(
        boolean success,
        String message,
        List<K8sAppliedResourceDto> resources) {
}
