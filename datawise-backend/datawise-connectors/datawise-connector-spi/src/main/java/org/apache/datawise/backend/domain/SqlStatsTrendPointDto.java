package org.apache.datawise.backend.domain;

public record SqlStatsTrendPointDto(
        String date,
        long runCount,
        long avgDurationMs,
        long maxDurationMs) {
}
