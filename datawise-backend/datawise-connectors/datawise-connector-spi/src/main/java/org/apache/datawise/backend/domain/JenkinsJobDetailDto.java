package org.apache.datawise.backend.domain;

import java.util.List;

public record JenkinsJobDetailDto(
        String name,
        String fullName,
        String url,
        String color,
        String description,
        boolean buildable,
        boolean inQueue,
        JenkinsBuildDto lastBuild,
        JenkinsBuildDto lastCompletedBuild,
        JenkinsBuildDto lastSuccessfulBuild,
        JenkinsBuildDto lastFailedBuild,
        List<JenkinsBuildDto> builds,
        List<JenkinsJobParameterDto> parameterDefinitions) {
}
