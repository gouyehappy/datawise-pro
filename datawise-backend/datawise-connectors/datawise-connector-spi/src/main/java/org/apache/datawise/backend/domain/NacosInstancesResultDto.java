package org.apache.datawise.backend.domain;

import java.util.List;

public record NacosInstancesResultDto(
        List<NacosInstanceDto> instances,
        int totalCount) {
}
