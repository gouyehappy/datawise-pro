package org.apache.datawise.backend.domain;

public record KafkaTopicConfigsDto(
        String topic,
        Long retentionMs,
        Long retentionBytes) {
}
