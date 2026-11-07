package org.apache.datawise.backend.domain;

import java.util.Map;

public record TableRowMutateRequest(
        String connectionId,
        String database,
        Map<String, Object> values) {
}
