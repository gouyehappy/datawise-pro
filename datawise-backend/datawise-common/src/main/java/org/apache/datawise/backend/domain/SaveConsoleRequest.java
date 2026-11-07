package org.apache.datawise.backend.domain;

import java.util.List;

public record SaveConsoleRequest(
        String name,
        String connectionName,
        String sql,
        String folder,
        List<String> tags) {

    public SaveConsoleRequest {
        tags = tags != null ? List.copyOf(tags) : List.of();
    }
}
