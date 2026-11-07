package org.apache.datawise.backend.domain;

public record YarnNodeDto(
        String id,
        String state,
        String nodeHealthStatus,
        long lastHealthUpdate,
        int numContainers,
        long usedMemoryMb,
        long availMemoryMb,
        int usedVirtualCores,
        int availableVirtualCores) {
}
