package org.apache.datawise.backend.domain;

public record YarnAppDetailDto(
        String id,
        String name,
        String user,
        String queue,
        String state,
        String finalStatus,
        String applicationType,
        double progress,
        long startedTime,
        long finishedTime,
        long elapsedTime,
        long allocatedMb,
        int allocatedVCores,
        int runningContainers,
        String trackingUrl,
        String amHostHttpAddress,
        String diagnostics) {
}
