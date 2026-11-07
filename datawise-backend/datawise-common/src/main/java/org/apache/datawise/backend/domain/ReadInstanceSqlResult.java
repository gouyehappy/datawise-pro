package org.apache.datawise.backend.domain;

public record ReadInstanceSqlResult(
        String sql,
        String fileName,
        String relativePath) {
}
