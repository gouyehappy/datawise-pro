package org.apache.datawise.backend.domain;

import java.util.List;

public record KafkaMessagesResultDto(
        List<KafkaMessageDto> messages,
        boolean hasMore) {
}
