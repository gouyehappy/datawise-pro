package org.apache.datawise.backend.domain;

import java.util.List;

public record YarnAppsResultDto(
        List<YarnAppDto> apps,
        int totalCount) {
}
