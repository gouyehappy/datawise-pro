package org.apache.datawise.backend.domain;

import java.util.List;

public record KafkaTopicPartitionDto(
        int partition,
        long beginningOffset,
        long endOffset,
        int leader,
        List<Integer> replicas,
        List<Integer> isr) {
}
