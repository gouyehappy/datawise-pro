package org.apache.datawise.backend.domain;

import java.util.List;

public record JenkinsQueueResultDto(
        List<JenkinsQueueItemDto> items,
        int totalCount) {
}
