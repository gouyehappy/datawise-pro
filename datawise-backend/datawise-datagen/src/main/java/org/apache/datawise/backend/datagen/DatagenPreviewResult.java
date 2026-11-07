package org.apache.datawise.backend.datagen;

import java.util.List;
import java.util.Map;

public record DatagenPreviewResult(
        String connectionId,
        String database,
        String tableName,
        int rowCount,
        long seed,
        List<Map<String, Object>> previewRows,
        String insertSql
) {
}

