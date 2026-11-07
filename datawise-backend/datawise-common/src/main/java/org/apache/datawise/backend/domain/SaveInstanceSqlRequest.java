package org.apache.datawise.backend.domain;

public record SaveInstanceSqlRequest(
        String connectionId,
        String instanceId,
        String instanceName,
        String sql,
        String fileName) {
}
