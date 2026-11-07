package org.apache.datawise.backend.domain;

import java.util.List;

public record FederatedLineageSourceDto(
        String alias,
        String connectionId,
        String database,
        String dbType) {
}
