package org.apache.datawise.backend.domain;

import java.util.List;

public record KafkaTopicDetailDto(
        String name,
        int partitionCount,
        short replicationFactor,
        List<KafkaTopicPartitionDto> partitions) {
}
