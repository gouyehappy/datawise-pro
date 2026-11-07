package org.apache.datawise.backend.domain;

public record UpdateKafkaTopicConfigsRequest(
        Long retentionMs,
        Long retentionBytes) {
}
