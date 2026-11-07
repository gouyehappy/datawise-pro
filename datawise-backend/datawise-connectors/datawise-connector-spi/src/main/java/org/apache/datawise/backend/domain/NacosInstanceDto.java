package org.apache.datawise.backend.domain;

public record NacosInstanceDto(
        String ip,
        int port,
        boolean healthy,
        double weight,
        String clusterName,
        String serviceName,
        boolean enabled,
        String metadata) {
}
