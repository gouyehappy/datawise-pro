package org.apache.datawise.backend.domain;

import java.util.List;

public record PolarisServicesResultDto(
        List<PolarisServiceDto> services,
        int totalCount) {
}
