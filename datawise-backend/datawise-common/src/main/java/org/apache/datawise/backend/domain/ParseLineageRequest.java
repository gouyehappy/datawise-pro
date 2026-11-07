package org.apache.datawise.backend.domain;

import java.util.List;

public record ParseLineageRequest(
        String connectionId,
        String instanceName,
        String name,
        String sql,
        String dbType,
        Integer maxDepth,
        Boolean forceRefresh,
        List<FederatedLineageSourceDto> federatedSources) {

    public ParseLineageRequest {
        federatedSources = federatedSources == null ? List.of() : List.copyOf(federatedSources);
    }

    public ParseLineageRequest(
                               String connectionId,
                               String instanceName,
                               String name,
                               String sql,
                               String dbType,
                               Integer maxDepth,
                               Boolean forceRefresh) {
        this(connectionId, instanceName, name, sql, dbType, maxDepth, forceRefresh, List.of());
    }
}
