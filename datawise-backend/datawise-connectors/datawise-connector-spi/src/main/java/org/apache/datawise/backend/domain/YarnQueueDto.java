package org.apache.datawise.backend.domain;

public record YarnQueueDto(
        String name,
        String state,
        float capacity,
        float usedCapacity,
        int numApplications) {
}
