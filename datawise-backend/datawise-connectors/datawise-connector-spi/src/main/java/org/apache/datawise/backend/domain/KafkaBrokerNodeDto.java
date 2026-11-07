package org.apache.datawise.backend.domain;

public record KafkaBrokerNodeDto(
        int id,
        String host,
        int port,
        String rack) {
}
