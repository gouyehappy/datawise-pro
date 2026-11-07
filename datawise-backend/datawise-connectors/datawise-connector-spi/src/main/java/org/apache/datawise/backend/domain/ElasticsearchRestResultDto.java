package org.apache.datawise.backend.domain;

import java.util.List;
import java.util.Map;

public record ElasticsearchRestResultDto(
        String method,
        String path,
        int status,
        String risk,
        String rawBody,
        boolean tabular,
        List<Map<String, Object>> columns,
        List<Map<String, Object>> rows,
        long durationMs,
        String error) {
}
