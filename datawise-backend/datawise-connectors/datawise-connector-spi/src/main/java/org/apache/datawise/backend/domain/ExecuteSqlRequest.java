package org.apache.datawise.backend.domain;

public record ExecuteSqlRequest(
        String sql,
        String connectionId,
        String database,
        Integer maxRows,
        String sessionKey,
        Integer pageSize,
        String cursorId,
        String perfSource,
        /** Optional per-request JDBC statement timeout (seconds). Null/≤0 → process default. */
        Integer timeoutSeconds
) {
    public ExecuteSqlRequest(
            String sql,
            String connectionId,
            String database,
            Integer maxRows,
            String sessionKey,
            Integer pageSize,
            String cursorId,
            String perfSource
    ) {
        this(sql, connectionId, database, maxRows, sessionKey, pageSize, cursorId, perfSource, null);
    }
}
