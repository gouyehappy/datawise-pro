package org.apache.datawise.backend.domain;

/**
 * One connector plugin listed in {@code config/plugins/manifest.json}.
 */
public record ConnectorPluginManifestEntry(
        String id,
        String version,
        String jar,
        String sha256,
        String downloadUrl) {
}
