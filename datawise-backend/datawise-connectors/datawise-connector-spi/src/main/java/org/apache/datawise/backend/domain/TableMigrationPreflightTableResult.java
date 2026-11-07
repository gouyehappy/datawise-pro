package org.apache.datawise.backend.domain;

import java.util.List;

public record TableMigrationPreflightTableResult(
        String tableName,
        boolean sourceExists,
        boolean targetExists,
        Long sourceRowCount,
        Long targetRowCount,
        int sourceColumnCount,
        int targetColumnCount,
        List<String> missingOnTarget,
        List<String> extraOnTarget,
        List<String> suggestedWatermarkColumns,
        List<String> primaryKeyColumns,
        String status,
        List<String> issues,
        List<MigrationColumnTypeMapping> columnMappings,
        String suggestedCreateDdl,
        List<String> mappingWarnings) {
}
