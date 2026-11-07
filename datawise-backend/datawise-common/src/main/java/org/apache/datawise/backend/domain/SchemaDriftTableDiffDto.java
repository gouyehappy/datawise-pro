package org.apache.datawise.backend.domain;

import java.util.List;

public record SchemaDriftTableDiffDto(
        String tableName,
        String status,
        List<String> missingOnTarget,
        List<String> extraOnTarget,
        List<String> typeMismatches,
        String suggestedAlterSql) {
}
