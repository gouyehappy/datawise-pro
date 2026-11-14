package org.apache.datawise.backend.domain;

import java.util.List;

public record SchemaDriftTableDiffDto(
        String tableName,
        String status,
        List<String> missingOnTarget,
        List<String> extraOnTarget,
        List<String> typeMismatches,
        List<String> attributeMismatches,
        String suggestedAlterSql) {

    /** Backward-compatible constructor when attribute mismatches are unavailable. */
    public SchemaDriftTableDiffDto(
            String tableName,
            String status,
            List<String> missingOnTarget,
            List<String> extraOnTarget,
            List<String> typeMismatches,
            String suggestedAlterSql
    ) {
        this(tableName, status, missingOnTarget, extraOnTarget, typeMismatches, List.of(), suggestedAlterSql);
    }
}
