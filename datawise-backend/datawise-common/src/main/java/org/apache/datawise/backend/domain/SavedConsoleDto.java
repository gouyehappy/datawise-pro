package org.apache.datawise.backend.domain;

import java.util.List;

public record SavedConsoleDto(
        String id,
        String name,
        String connectionName,
        String updatedAt,
        String sql,
        Boolean teamShared,
        String folder,
        List<String> tags,
        String projectId) {
}
