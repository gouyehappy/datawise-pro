package org.apache.datawise.backend.domain;

import java.util.List;
import java.util.Map;

public record TableDataResult(
        List<Map<String, Object>> columns,
        List<Map<String, Object>> rows,
        String cursorId,
        Boolean hasMore,
        Integer pageOffset,
        Integer pageSize) {

    public TableDataResult(List<Map<String, Object>> columns, List<Map<String, Object>> rows) {
        this(columns, rows, null, null, null, null);
    }
}
