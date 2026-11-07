package org.apache.datawise.backend.domain;

public record LockWaitEdgeDto(
        String waitingSessionId,
        String blockingSessionId,
        long waitSeconds,
        String waitingSql,
        String blockingSql,
        String waitingUser,
        String blockingUser) {
}
