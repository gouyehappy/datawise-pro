package org.apache.datawise.backend.domain;

import java.util.List;

public record UpdateOnCallConnectionsRequest(List<String> connectionIds) {
}
