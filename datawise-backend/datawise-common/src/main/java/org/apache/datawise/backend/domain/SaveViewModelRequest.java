package org.apache.datawise.backend.domain;

public record SaveViewModelRequest(
        String connectionId,
        String instanceId,
        String instanceName,
        String name,
        String sql) {
}
