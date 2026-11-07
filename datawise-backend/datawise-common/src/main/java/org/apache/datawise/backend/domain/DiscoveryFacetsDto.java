package org.apache.datawise.backend.domain;

import java.util.List;

/**
 * Facet buckets for discovery browse/search (server-side).
 */
public record DiscoveryFacetsDto(
        List<DiscoveryFacetValueDto> kinds,
        List<DiscoveryFacetValueDto> connections,
        List<DiscoveryFacetValueDto> owners,
        List<DiscoveryFacetValueDto> tags) {

    public static DiscoveryFacetsDto empty() {
        return new DiscoveryFacetsDto(List.of(), List.of(), List.of(), List.of());
    }
}
