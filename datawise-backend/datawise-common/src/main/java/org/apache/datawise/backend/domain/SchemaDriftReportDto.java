package org.apache.datawise.backend.domain;

import java.time.Instant;
import java.util.List;

public record SchemaDriftReportDto(
        String sourceConnectionId,
        String sourceDatabase,
        String targetConnectionId,
        String targetDatabase,
        Instant comparedAt,
        int driftTableCount,
        List<SchemaDriftTableDiffDto> tables) {
}
