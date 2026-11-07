package org.apache.datawise.backend.domain;

import java.util.Map;

public record KafkaMessageDto(
        int partition,
        long offset,
        long timestamp,
        String key,
        String value,
        Map<String, String> headers) {
}
