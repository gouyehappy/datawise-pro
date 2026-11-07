package org.apache.datawise.backend.domain;

import java.util.List;

public record InstallConnectorBatchRequest(List<String> connectorIds) {
}
