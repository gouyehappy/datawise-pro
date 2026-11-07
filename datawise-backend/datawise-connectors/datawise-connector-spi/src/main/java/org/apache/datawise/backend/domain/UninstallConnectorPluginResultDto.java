package org.apache.datawise.backend.domain;

public record UninstallConnectorPluginResultDto(
        String connectorId,
        String jarName,
        boolean deleted,
        boolean restartRequired,
        String message) {
}
