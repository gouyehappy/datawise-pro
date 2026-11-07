package org.apache.datawise.backend.domain;

import java.util.List;

public record PolarisInstancesResultDto(
        List<PolarisInstanceDto> instances,
        int totalCount) {
}
