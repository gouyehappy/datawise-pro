package org.apache.datawise.backend.domain;

public record PolarisServiceDto(
        String name,
        String namespace,
        String owners,
        String ports,
        String business,
        String department,
        String comment,
        String revision) {
}
