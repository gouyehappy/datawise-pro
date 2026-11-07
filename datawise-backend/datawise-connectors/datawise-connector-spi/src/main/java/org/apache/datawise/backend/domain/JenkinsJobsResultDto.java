package org.apache.datawise.backend.domain;

import java.util.List;

public record JenkinsJobsResultDto(
        List<JenkinsJobDto> jobs,
        int totalCount) {
}
