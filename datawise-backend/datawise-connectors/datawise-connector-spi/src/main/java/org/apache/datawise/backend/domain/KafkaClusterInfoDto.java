package org.apache.datawise.backend.domain;

import java.util.List;

public record KafkaClusterInfoDto(
        String clusterId,
        int controllerId,
        List<KafkaBrokerNodeDto> brokers) {
}
