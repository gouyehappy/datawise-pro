package org.apache.datawise.backend.domain;

public record InstallConnectorPluginResultDto(
        String connectorId,
        String jarName,
        String integrityStatus,
        boolean restartRequired,
        String message) {
}
