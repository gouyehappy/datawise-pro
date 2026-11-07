package org.apache.datawise.backend.domain;

import java.util.List;

public record LineageMetaDto(
        String sqlHash,
        String parsedAt,
        String dialect,
        LineageDialectCompatibility dialectCompatibility,
        String parser,
        String parserVersion,
        int depth,
        String status,
        List<LineageWarningDto> warnings) {
}
