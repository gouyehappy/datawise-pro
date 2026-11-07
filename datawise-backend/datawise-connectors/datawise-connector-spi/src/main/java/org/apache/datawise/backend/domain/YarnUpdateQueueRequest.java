package org.apache.datawise.backend.domain;

import java.util.Map;

public record YarnUpdateQueueRequest(
        String queueName,
        Map<String, String> params) {
}
