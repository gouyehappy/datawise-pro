package org.apache.datawise.backend.domain;

import java.util.List;

public record ConnectorPluginReloadResultDto(
        int loadedJarCount,
        List<String> loadedConnectorIds,
        List<ConnectorPluginLoadFailure> failures) {
}
