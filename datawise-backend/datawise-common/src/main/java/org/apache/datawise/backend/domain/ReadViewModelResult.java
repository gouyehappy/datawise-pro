package org.apache.datawise.backend.domain;

public record ReadViewModelResult(
        String sql,
        String name,
        String fileName,
        String relativePath,
        boolean draft) {
}
