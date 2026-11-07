package org.apache.datawise.backend.domain;

import java.util.List;

public record KafkaConsumerGroupMetricsDto(
        String groupId,
        String state,
        int memberCount,
        long totalLag,
        List<KafkaConsumerGroupPartitionMetricDto> partitions) {
}
