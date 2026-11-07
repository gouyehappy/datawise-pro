package org.apache.datawise.backend.domain;

public record SaveQueryLibraryVersionRequest(
        String teamId,
        String queryId,
        String title,
        String sql,
        String changeNote) {
}
