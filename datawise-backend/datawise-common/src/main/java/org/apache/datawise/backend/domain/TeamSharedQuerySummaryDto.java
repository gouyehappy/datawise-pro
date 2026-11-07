package org.apache.datawise.backend.domain;

import java.util.List;

public record TeamSharedQuerySummaryDto(
        String id,
        String teamId,
        String title,
        String description,
        String connectionId,
        String connectionName,
        String database,
        List<String> tags,
        String sharedByUserName,
        Long sharedByUserId,
        String sharedAt,
        String updatedAt,
        int commentCount,
        int favoriteCount,
        boolean starredByCurrentUser) {
}
