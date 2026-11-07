package org.apache.datawise.backend.domain;

public record ElasticsearchIndexMetadataDto(
        String index,
        String mappingJson,
        String settingsJson,
        String statsJson) {
}
