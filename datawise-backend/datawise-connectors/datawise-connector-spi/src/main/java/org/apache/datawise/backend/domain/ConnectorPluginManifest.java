package org.apache.datawise.backend.domain;

import java.util.List;

/**
 * Version / integrity catalog for optional connector JARs under {@code config/plugins/}.
 */
public record ConnectorPluginManifest(
        int schemaVersion,
        String updatedAt,
        String channel,
        List<ConnectorPluginManifestEntry> plugins) {

    public ConnectorPluginManifest {
        plugins = plugins != null ? List.copyOf(plugins) : List.of();
    }
}
