package org.apache.datawise.backend.domain;

public record JenkinsBuildDto(
        int number,
        String url,
        String result,
        boolean building,
        long timestamp,
        long duration,
        String displayName) {
}
