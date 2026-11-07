package org.apache.datawise.backend.domain;

/**
 * In-flight or last JDBC driver download snapshot for {@code GET /api/datasources/drivers/progress}.
 */
public record JdbcDriverDownloadProgressDto(
        String mavenCoordinates,
        long downloadedBytes,
        long totalBytes,
        boolean active,
        boolean completed,
        boolean cached,
        String error) {
}
