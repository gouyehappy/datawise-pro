package org.apache.datawise.backend.domain;

import java.util.List;

public record JenkinsNodesResultDto(
        List<JenkinsNodeDto> nodes,
        int totalCount) {
}
