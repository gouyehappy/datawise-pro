package org.apache.datawise.backend.domain;

import java.util.List;

public record K8sEventsResultDto(
        List<K8sEventDto> events,
        int totalCount) {
}
