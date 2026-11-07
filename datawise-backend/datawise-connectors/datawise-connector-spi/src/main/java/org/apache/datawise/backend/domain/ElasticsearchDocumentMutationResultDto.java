package org.apache.datawise.backend.domain;

public record ElasticsearchDocumentMutationResultDto(
        String id,
        String index,
        String result,
        int status,
        String rawBody) {
}
