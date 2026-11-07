package org.apache.datawise.backend.domain;

public record CreateKafkaTopicRequest(
        String name,
        Integer partitions,
        Short replicationFactor) {
}
