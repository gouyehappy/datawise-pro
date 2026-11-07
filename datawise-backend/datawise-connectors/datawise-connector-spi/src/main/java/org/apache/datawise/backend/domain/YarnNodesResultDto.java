package org.apache.datawise.backend.domain;

import java.util.List;

public record YarnNodesResultDto(
        List<YarnNodeDto> nodes,
        int totalCount) {
}
