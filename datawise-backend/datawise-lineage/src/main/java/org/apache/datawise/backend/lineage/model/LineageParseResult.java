package org.apache.datawise.backend.lineage.model;

import org.apache.datawise.backend.domain.LineageDialectCompatibility;

import java.util.List;

public record LineageParseResult(
        List<ColumnLineage> columns,
        List<LineageWarning> warnings,
        ParseStatus status,
        String engineId,
        String engineVersion,
        LineageDialectCompatibility dialectCompatibility
) {
    public static LineageParseResult failed(String engineId, String engineVersion, String message) {
        return failed(engineId, engineVersion, LineageDialectCompatibility.UNKNOWN, message);
    }

    public static LineageParseResult failed(
            String engineId,
            String engineVersion,
            LineageDialectCompatibility dialectCompatibility,
            String message
    ) {
        return new LineageParseResult(
                List.of(),
                List.of(LineageWarning.of("PARSER_FAILED", message)),
                ParseStatus.FAILED,
                engineId,
                engineVersion,
                dialectCompatibility == null ? LineageDialectCompatibility.UNKNOWN : dialectCompatibility
        );
    }
}
