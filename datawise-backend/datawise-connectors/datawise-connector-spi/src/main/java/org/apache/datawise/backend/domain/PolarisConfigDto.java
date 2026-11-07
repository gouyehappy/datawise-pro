package org.apache.datawise.backend.domain;

public record PolarisConfigDto(
        String name,
        String namespace,
        String group,
        String format,
        String comment) {
}
