package org.apache.datawise.backend.domain;

import java.util.List;

public record K8sCrdsResultDto(
        List<K8sCrdDto> crds,
        int totalCount) {
}
