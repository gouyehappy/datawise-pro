package org.apache.datawise.backend.domain;

public record SubmitTeamProductionApprovalRequest(
        String connectionId,
        String connectionName,
        String database,
        String sql) {
}
