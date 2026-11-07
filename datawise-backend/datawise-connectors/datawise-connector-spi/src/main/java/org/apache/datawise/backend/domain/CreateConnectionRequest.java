package org.apache.datawise.backend.domain;

public record CreateConnectionRequest(ConnectionConfig config, String groupId) {
}
