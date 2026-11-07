package org.apache.datawise.backend.domain;

/**
 * Lightweight column peek for table/view discovery hits (from schema cache when available).
 */
public record DiscoveryColumnPeekDto(String name, String type) {
}
