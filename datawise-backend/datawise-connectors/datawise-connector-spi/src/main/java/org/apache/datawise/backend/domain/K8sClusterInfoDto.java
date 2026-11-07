package org.apache.datawise.backend.domain;

public record K8sClusterInfoDto(
        String gitVersion,
        String platform,
        String major,
        String minor) {
}
