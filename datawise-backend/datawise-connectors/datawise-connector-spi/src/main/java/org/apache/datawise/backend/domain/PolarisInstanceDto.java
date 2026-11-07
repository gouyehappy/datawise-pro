package org.apache.datawise.backend.domain;

public record PolarisInstanceDto(
        String id,
        String host,
        int port,
        String protocol,
        String version,
        int weight,
        boolean healthy,
        boolean isolate,
        String namespace,
        String service) {
}
