package org.apache.datawise.backend.domain;

public record K8sServiceDto(
        String name,
        String namespace,
        String type,
        String clusterIp,
        String ports,
        String creationTimestamp) {
}
