package org.apache.datawise.backend.domain;

/**
 * One facet value with hit count (computed before applying that facet's selection).
 */
public record DiscoveryFacetValueDto(
        String value,
        String label,
        int count) {
}
