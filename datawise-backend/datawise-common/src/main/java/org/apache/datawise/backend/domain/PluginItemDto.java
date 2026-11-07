package org.apache.datawise.backend.domain;

public record PluginItemDto(
        String id,
        String name,
        String version,
        String author,
        String description,
        boolean enabled,
        String category) {
}
