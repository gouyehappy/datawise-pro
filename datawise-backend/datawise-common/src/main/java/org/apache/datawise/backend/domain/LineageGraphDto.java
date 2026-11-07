package org.apache.datawise.backend.domain;

import java.util.List;

public record LineageGraphDto(
        LineageNodeRefDto root,
        List<LineageNodeDto> nodes,
        List<LineageEdgeDto> edges,
        LineageMetaDto meta,
        List<LineageColumnMappingDto> columnMappings) {

    public LineageGraphDto {
        columnMappings = columnMappings == null ? List.of() : List.copyOf(columnMappings);
    }

    public LineageGraphDto(
                           LineageNodeRefDto root,
                           List<LineageNodeDto> nodes,
                           List<LineageEdgeDto> edges,
                           LineageMetaDto meta) {
        this(root, nodes, edges, meta, List.of());
    }
}
