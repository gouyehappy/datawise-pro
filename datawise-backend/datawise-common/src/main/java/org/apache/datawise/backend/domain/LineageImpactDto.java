package org.apache.datawise.backend.domain;

import java.util.List;

public record LineageImpactDto(
        String sourceModel,
        List<LineageImpactItemDto> downstream) {

    public LineageImpactDto {
        downstream = downstream == null ? List.of() : List.copyOf(downstream);
    }
}
