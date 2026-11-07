package org.apache.datawise.backend.domain;

public record JdbcDriverResolveRequest(String mavenCoordinates, String driverClass) {
}
