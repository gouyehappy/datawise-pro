package org.apache.datawise.backend.domain;

import java.util.List;

/** Aggregated explorer UI catalog across loaded connectors. */
public record ConnectorExplorerUiCatalogDto(
        List<ConnectorExplorerUiProfileDto> profiles) {
}
