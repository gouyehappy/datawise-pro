package org.apache.datawise.backend.domain;

public record ProduceKafkaMessageRequest(
        String key,
        String value,
        Integer partition) {
}
