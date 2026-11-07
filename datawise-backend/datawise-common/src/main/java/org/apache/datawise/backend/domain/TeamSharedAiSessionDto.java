package org.apache.datawise.backend.domain;

public record TeamSharedAiSessionDto(
        String id,
        String teamId,
        String title,
        String sharedByUserName,
        String sharedAt,
        int messageCount) {
}
