package org.apache.datawise.backend.service.discovery;

import org.apache.datawise.backend.domain.DiscoveryColumnPeekDto;

import java.util.List;

/**
 * Flattened table/view row for discovery search (avoids walking schema trees per query).
 */
public record DiscoveryIndexedRelation(
        String kind,
        String id,
        String name,
        String qualifiedLabel,
        String connectionId,
        String connectionLabel,
        String database,
        String comment,
        String searchText,
        List<String> tags,
        List<DiscoveryColumnPeekDto> columns) {
}
