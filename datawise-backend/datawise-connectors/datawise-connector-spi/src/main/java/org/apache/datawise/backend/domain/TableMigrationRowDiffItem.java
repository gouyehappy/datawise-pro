package org.apache.datawise.backend.domain;

import java.util.List;
import java.util.Map;

/** One sampled row classification for PK-based migration preview. */
public record TableMigrationRowDiffItem(
        String kind,
        Map<String, Object> primaryKey,
        List<String> changedColumns,
        Map<String, Object> sourceValues,
        Map<String, Object> targetValues) {
}
