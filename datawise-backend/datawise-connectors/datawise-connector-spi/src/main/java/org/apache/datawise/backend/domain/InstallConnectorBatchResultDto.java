package org.apache.datawise.backend.domain;

import java.util.List;

public record InstallConnectorBatchResultDto(
        List<InstallConnectorPluginResultDto> results,
        ConnectorPluginReloadResultDto reload) {
}
