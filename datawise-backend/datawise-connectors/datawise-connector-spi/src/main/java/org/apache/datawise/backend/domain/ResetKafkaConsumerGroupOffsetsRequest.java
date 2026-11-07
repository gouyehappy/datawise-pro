package org.apache.datawise.backend.domain;

/**
 * Reset committed offsets for a consumer group on one topic.
 * {@code strategy} is {@code earliest} or {@code latest}.
 */
public record ResetKafkaConsumerGroupOffsetsRequest(
        String topic,
        String strategy) {
}
