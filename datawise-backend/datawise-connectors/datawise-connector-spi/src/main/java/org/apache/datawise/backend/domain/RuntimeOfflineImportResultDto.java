package org.apache.datawise.backend.domain;

import java.util.List;

/** Result of importing an offline runtime zip into {@code config/plugins} / {@code config/drivers}. */
public record RuntimeOfflineImportResultDto(
        List<String> pluginJars,
        List<String> driverJars,
        boolean catalogOverlay,
        ConnectorPluginReloadResultDto reload,
        String message) {
}
