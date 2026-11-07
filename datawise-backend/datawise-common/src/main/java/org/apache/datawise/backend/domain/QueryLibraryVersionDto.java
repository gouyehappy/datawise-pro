package org.apache.datawise.backend.domain;

import java.time.Instant;

public record QueryLibraryVersionDto(
        String queryId,
        String teamId,
        int version,
        String title,
        String sql,
        String changeNote,
        Instant savedAt,
        Long savedByUserId) {
}
