package org.apache.datawise.backend.domain;

import java.util.List;

public record ShareProjectConnectionsRequest(
        List<String> connectionIds,
        List<String> targetProjectIds) {
}
