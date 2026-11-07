package org.apache.datawise.backend.domain;

public record JenkinsBuildLogDto(
        String text,
        boolean moreData,
        int nextStart) {
}
