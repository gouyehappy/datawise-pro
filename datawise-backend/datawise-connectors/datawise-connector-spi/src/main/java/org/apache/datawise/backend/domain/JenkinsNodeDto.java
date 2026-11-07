package org.apache.datawise.backend.domain;

public record JenkinsNodeDto(
        String displayName,
        String description,
        boolean offline,
        boolean temporarilyOffline,
        boolean idle,
        int numExecutors,
        int busyExecutors,
        String offlineCauseReason,
        String assignedLabels) {
}
