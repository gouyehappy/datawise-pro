package org.apache.datawise.backend.domain;

import java.util.Map;

public record TableRowUpdateRequest(
        String connectionId,
        String database,
        Map<String, Object> keyValues,
        Map<String, Object> values) {
}
