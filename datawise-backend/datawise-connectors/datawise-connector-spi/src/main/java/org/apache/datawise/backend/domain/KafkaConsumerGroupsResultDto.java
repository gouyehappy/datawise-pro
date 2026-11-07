package org.apache.datawise.backend.domain;

import java.util.List;

public record KafkaConsumerGroupsResultDto(
        List<KafkaConsumerGroupSummaryDto> groups,
        int totalCount) {
}
