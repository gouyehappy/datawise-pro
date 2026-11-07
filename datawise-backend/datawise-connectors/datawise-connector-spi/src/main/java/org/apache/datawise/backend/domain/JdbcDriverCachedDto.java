package org.apache.datawise.backend.domain;

/** One JDBC driver JAR cached under {@code config/drivers/}. */
public record JdbcDriverCachedDto(
        String fileName,
        String relativePath,
        long sizeBytes,
        boolean loadedInMemory) {
}
