package org.apache.datawise.backend.domain;

public record JenkinsJobDto(
        String name,
        String fullName,
        String url,
        String color,
        String jobClass,
        boolean buildable,
        boolean folder,
        Integer lastBuildNumber,
        String lastBuildResult,
        boolean lastBuildBuilding,
        long lastBuildTimestamp,
        long lastBuildDuration,
        long lastSuccessTimestamp,
        long lastFailureTimestamp) {
}
