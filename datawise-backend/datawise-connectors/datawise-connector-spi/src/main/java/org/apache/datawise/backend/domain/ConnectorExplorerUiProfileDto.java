package org.apache.datawise.backend.domain;

import java.util.List;

/** Explorer UI profile for one dbType (feature tree + connection open menu). */
public record ConnectorExplorerUiProfileDto(
        String dbType,
        List<ConnectorExplorerFeatureDto> features) {
}
