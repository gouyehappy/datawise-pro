package org.apache.datawise.backend.domain;

import java.util.List;

/**
 * Org-level discovery hit: cached tables/views across visible connections, or semantic metrics.
 */
public record DiscoveryHitDto(
        String kind,
        String id,
        String name,
        String qualifiedLabel,
        String connectionId,
        String connectionLabel,
        String database,
        String owner,
        String subtitle,
        int score,
        /** Populated for metrics — related physical tables for lineage jump. */
        List<String> relatedTables,
        /** Table/view column peek from schema cache (empty when columns not hydrated). */
        List<DiscoveryColumnPeekDto> columns,
        /** Metric tags and/or hashtags parsed from table/view comments ({@code #pii}). */
        List<String> tags) {
}
