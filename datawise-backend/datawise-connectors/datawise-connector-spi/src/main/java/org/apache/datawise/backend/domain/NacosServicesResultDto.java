package org.apache.datawise.backend.domain;

import java.util.List;

public record NacosServicesResultDto(
        List<NacosServiceDto> services,
        int totalCount) {
}
