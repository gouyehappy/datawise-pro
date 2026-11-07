package org.apache.datawise.backend.domain;

import java.util.List;

public record PolarisConfigGroupsResultDto(
        List<PolarisConfigGroupDto> groups,
        int totalCount) {
}
