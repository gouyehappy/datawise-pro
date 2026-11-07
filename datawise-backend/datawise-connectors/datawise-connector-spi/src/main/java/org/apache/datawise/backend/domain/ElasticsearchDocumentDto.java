package org.apache.datawise.backend.domain;

/** Single Elasticsearch document page / mutation helpers. */
public record ElasticsearchDocumentDto(
        String id,
        String index,
        String routing,
        String sourceJson) {
}
