package org.apache.datawise.backend.domain;

public record IncreaseKafkaPartitionsRequest(
        int partitions) {
}
