package org.apache.datawise.backend.domain;

public record KafkaConsumerGroupPartitionMetricDto(
        String topic,
        int partition,
        long committedOffset,
        long endOffset,
        long lag,
        String memberId) {
}
