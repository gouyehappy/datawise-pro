package org.apache.datawise.backend.domain;

import java.util.List;

public record KafkaTopicsResultDto(
        List<String> topics,
        int totalCount) {
}
