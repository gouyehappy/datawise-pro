package org.apache.datawise.backend.domain;

public record JdbcDriverResolveResult(
        String mavenCoordinates,
        String driverClass,
        String localPath,
        boolean downloaded,
        boolean cached) {
}
