package org.apache.datawise.backend.domain;

import java.util.List;

/**
 * Unified JDBC driver library: product catalog families + on-disk cache.
 */
public record JdbcDriverCatalogDto(
        List<JdbcDriverFamilyDto> families,
        List<JdbcDriverCachedDto> orphans,
        List<JdbcDriverCachedDto> drivers,
        long totalBytes,
        String driversDirectory) {
}
