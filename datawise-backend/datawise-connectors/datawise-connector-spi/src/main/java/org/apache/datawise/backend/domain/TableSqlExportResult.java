package org.apache.datawise.backend.domain;

public record TableSqlExportResult(
        String sql,
        String fileName) {
}
