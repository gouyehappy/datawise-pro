package org.apache.datawise.backend.domain;

public record KafkaConsumerGroupSummaryDto(
        String groupId,
        String state) {
}
