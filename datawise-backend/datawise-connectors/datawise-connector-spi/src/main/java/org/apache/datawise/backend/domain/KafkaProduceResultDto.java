package org.apache.datawise.backend.domain;

public record KafkaProduceResultDto(
        String topic,
        int partition,
        long offset) {
}
