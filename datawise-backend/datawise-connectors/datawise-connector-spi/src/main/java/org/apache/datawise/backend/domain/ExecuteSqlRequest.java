package org.apache.datawise.backend.domain;

public record ExecuteSqlRequest(
        String sql,
        String connectionId,
        String database,
        Integer maxRows,
        String sessionKey,
        Integer pageSize,
        String cursorId,
        String perfSource) {
}
