package org.apache.datawise.backend.domain;

import java.util.List;

public record TeamSharedQueryDetailDto(
        String id,
        String teamId,
        String title,
        String description,
        String connectionId,
        String connectionName,
        String database,
        String sql,
        List<String> tags,
        String sharedByUserName,
        Long sharedByUserId,
        String sharedAt,
        String updatedAt,
        int favoriteCount,
        boolean starredByCurrentUser,
        List<TeamSharedQueryCommentDto> comments) {
}
