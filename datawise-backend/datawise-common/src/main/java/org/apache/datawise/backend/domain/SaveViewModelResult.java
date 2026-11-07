package org.apache.datawise.backend.domain;

public record SaveViewModelResult(
        String relativePath,
        String name,
        String fileName,
        String directory,
        boolean draft) {
}
