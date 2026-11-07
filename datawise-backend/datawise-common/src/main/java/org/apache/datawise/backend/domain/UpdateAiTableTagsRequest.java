package org.apache.datawise.backend.domain;

import java.util.List;

public record UpdateAiTableTagsRequest(
        String connectionId,
        String database,
        List<String> tableNames,
        boolean tagged) {
}
