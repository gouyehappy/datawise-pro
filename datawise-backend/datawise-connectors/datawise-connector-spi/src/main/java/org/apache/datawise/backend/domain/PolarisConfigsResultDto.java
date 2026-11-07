package org.apache.datawise.backend.domain;

import java.util.List;

public record PolarisConfigsResultDto(
        List<PolarisConfigDto> configs,
        int totalCount) {
}
