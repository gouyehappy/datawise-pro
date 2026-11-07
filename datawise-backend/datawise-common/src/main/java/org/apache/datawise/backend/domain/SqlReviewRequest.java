package org.apache.datawise.backend.domain;

public record SqlReviewRequest(
        String sql,
        String connectionId,
        String database,
        Boolean aiRewrite) {

    public SqlReviewRequest(String sql, String connectionId, String database) {
        this(sql, connectionId, database, null);
    }
}
