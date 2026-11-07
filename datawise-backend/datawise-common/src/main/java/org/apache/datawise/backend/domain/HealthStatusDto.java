package org.apache.datawise.backend.domain;

public record HealthStatusDto(String status, String version, String serverTime, String scriptsDir, String configDir) {
}
