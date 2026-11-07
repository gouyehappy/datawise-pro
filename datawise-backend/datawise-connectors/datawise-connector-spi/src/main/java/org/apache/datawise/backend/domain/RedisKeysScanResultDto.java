package org.apache.datawise.backend.domain;

import java.util.List;

public record RedisKeysScanResultDto(
        List<String> keys,
        String cursor,
        boolean hasMore,
        long dbSize) {
}
