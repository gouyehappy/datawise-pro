package org.apache.datawise.backend.domain;

import java.util.List;

public record SaveSemanticMetricRequest(
        String id,
        String connectionId,
        String database,
        String name,
        String expression,
        String description,
        String unit,
        List<String> relatedTables,
        List<String> upstreamMetrics,
        String changeNote,
        String owner,
        List<String> tags) {
}
