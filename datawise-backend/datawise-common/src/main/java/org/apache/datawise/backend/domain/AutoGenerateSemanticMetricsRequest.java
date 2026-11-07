package org.apache.datawise.backend.domain;

public record AutoGenerateSemanticMetricsRequest(
        String connectionId,
        String database) {
}
