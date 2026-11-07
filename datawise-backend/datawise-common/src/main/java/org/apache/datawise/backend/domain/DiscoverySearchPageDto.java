package org.apache.datawise.backend.domain;

import java.util.List;

/**
 * Paginated discovery search / browse page.
 */
public record DiscoverySearchPageDto(
        List<DiscoveryHitDto> hits,
        int total,
        int offset,
        int limit,
        boolean hasMore,
        DiscoveryFacetsDto facets) {

    /** Backward-compatible constructor without facets. */
    public DiscoverySearchPageDto(
                                  List<DiscoveryHitDto> hits,
                                  int total,
                                  int offset,
                                  int limit,
                                  boolean hasMore) {
        this(hits, total, offset, limit, hasMore, DiscoveryFacetsDto.empty());
    }
}
