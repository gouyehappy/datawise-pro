package org.apache.datawise.backend.domain;

import java.util.List;
import java.util.Map;

public record UpdateSharedConnectionsRequest(
        List<String> connectionIds,
        Map<String, String> connectionAccess) {
}
