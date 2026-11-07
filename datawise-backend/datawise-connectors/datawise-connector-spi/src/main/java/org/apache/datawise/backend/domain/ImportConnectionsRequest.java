package org.apache.datawise.backend.domain;

import java.util.List;

public record ImportConnectionsRequest(List<ConnectionConfig> configs) {
}
