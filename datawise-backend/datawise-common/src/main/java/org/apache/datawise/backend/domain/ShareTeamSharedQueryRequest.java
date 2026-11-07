package org.apache.datawise.backend.domain;

import java.util.List;

public record ShareTeamSharedQueryRequest(
        String title,
        String description,
        String connectionId,
        String connectionName,
        String database,
        String sql,
        List<String> tags) {

    public ShareTeamSharedQueryRequest {
        tags = tags != null ? List.copyOf(tags) : List.of();
    }
}
