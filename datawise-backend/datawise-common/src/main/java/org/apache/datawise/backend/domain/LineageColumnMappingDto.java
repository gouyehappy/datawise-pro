package org.apache.datawise.backend.domain;

import java.util.List;

public record LineageColumnMappingDto(
        String outputColumn,
        List<LineageSourceColumnDto> sources,
        String expression) {

    public LineageColumnMappingDto {
        sources = sources == null ? List.of() : List.copyOf(sources);
    }
}
