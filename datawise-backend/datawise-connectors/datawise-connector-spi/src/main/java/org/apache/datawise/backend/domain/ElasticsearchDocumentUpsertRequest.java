package org.apache.datawise.backend.domain;

public record ElasticsearchDocumentUpsertRequest(
        String id,
        String sourceJson,
        String routing) {
}
