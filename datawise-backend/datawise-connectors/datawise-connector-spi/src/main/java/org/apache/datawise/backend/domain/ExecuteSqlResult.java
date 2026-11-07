package org.apache.datawise.backend.domain;

import java.util.List;
import java.util.Map;

public record ExecuteSqlResult(
        String sql,
        int rowCount,
        long durationMs,
        List<Map<String, Object>> columns,
        List<Map<String, Object>> rows,
        String where,
        String orderBy,
        String cursorId,
        Boolean hasMore,
        Integer pageOffset,
        Integer pageSize) {
}
