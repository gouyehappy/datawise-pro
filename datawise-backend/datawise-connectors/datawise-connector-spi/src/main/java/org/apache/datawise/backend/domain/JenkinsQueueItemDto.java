package org.apache.datawise.backend.domain;

public record JenkinsQueueItemDto(
        long id,
        String taskName,
        String taskUrl,
        String why,
        boolean blocked,
        boolean buildable,
        long inQueueSince) {
}
