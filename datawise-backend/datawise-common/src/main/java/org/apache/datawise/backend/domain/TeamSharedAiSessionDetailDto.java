package org.apache.datawise.backend.domain;

public record TeamSharedAiSessionDetailDto(
        String id,
        String teamId,
        String title,
        String sharedByUserName,
        String sharedAt,
        String payloadJson) {
}
