package org.apache.datawise.backend.domain;

public record RedisCommandResultDto(
        String command,
        String output,
        boolean success,
        String error,
        long durationMs) {
}
