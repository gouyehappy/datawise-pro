package org.apache.datawise.backend.lineage.model;

import java.util.List;
import java.util.Set;

public record LineageParseRequest(
        String sql,
        String dbType,
        String connectionId,
        String instanceName,
        String database,
        String modelName,
        int maxDepth,
        Set<String> visitedModels,
        LineageResolutionContext resolution,
        List<FederatedLineageSource> federatedSources
) {
    public LineageParseRequest {
        resolution = resolution == null ? LineageResolutionContext.empty() : resolution;
        visitedModels = visitedModels == null ? Set.of() : Set.copyOf(visitedModels);
        federatedSources = federatedSources == null ? List.of() : List.copyOf(federatedSources);
    }

    public LineageParseRequest(
            String sql,
            String dbType,
            String connectionId,
            String instanceName,
            String database,
            String modelName,
            int maxDepth,
            Set<String> visitedModels,
            LineageResolutionContext resolution
    ) {
        this(sql, dbType, connectionId, instanceName, database, modelName, maxDepth, visitedModels, resolution, List.of());
    }

    public LineageParseRequest(
            String sql,
            String dbType,
            String connectionId,
            String instanceName,
            String database,
            String modelName,
            int maxDepth,
            Set<String> visitedModels
    ) {
        this(sql, dbType, connectionId, instanceName, database, modelName, maxDepth, visitedModels, LineageResolutionContext.empty(), List.of());
    }

    public LineageParseRequest withVisitedModel(String model) {
        if (model == null || model.isBlank()) {
            return this;
        }
        String normalized = model.trim().toLowerCase(java.util.Locale.ROOT);
        if (visitedModels.contains(normalized)) {
            return this;
        }
        java.util.HashSet<String> merged = new java.util.HashSet<>(visitedModels);
        merged.add(normalized);
        return new LineageParseRequest(
                sql,
                dbType,
                connectionId,
                instanceName,
                database,
                modelName,
                maxDepth,
                Set.copyOf(merged),
                resolution,
                federatedSources
        );
    }
}
