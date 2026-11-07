package org.apache.datawise.backend.domain;

import java.util.List;

public record JenkinsViewsResultDto(
        List<JenkinsViewDto> views,
        int totalCount) {
}
