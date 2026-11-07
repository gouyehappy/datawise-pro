package org.apache.datawise.backend.domain;

public record RedisKeyDetailDto(
        String key,
        String type,
        long ttlSeconds,
        long size,
        String preview,
        boolean previewTruncated) {
}
