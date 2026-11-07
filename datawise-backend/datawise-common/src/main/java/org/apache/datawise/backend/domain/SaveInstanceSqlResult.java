package org.apache.datawise.backend.domain;

public record SaveInstanceSqlResult(
        String relativePath,
        String fileName,
        String directory) {
}
