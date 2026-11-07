package org.apache.datawise.backend.domain;

public record LineageImpactItemDto(
        String modelName,
        String fileName,
        boolean staleSidecar) {
}
