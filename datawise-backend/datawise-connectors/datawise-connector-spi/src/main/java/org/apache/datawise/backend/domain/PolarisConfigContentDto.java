package org.apache.datawise.backend.domain;

public record PolarisConfigContentDto(
        String name,
        String namespace,
        String group,
        String content,
        String format,
        String md5) {
}
