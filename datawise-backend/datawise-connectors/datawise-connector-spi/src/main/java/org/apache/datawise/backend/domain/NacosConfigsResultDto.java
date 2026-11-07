package org.apache.datawise.backend.domain;

import java.util.List;

public record NacosConfigsResultDto(
        List<NacosConfigDto> configs,
        int totalCount,
        int pageSize) {
}
