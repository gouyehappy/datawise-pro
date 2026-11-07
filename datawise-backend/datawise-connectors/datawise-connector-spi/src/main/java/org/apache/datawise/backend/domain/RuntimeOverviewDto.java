package org.apache.datawise.backend.domain;

import java.util.List;

/** Runtime workspace overview for settings → runtime. */
public record RuntimeOverviewDto(
        RuntimeJreDto jre,
        RuntimeConnectorsDto connectors,
        RuntimeDriversDto drivers,
        RuntimeWorkspaceDto workspace,
        RuntimePackagingDto packaging) {

    public record RuntimeJreDto(String version, String vendor, String home, String source) {
    }

    public record RuntimeConnectorsDto(
            int installed,
            int catalogTotal,
            long pluginsBytes,
            List<ConnectorPluginLoadFailure> failures) {
    }

    public record RuntimeDriversDto(int cachedJars, long totalBytes) {
    }

    public record RuntimeWorkspaceDto(String configDir, long diskUsageBytes) {
    }

    /** Desktop installer profile (slim/core/full) when present under config/. */
    public record RuntimePackagingDto(String profile, String connectors, String drivers) {
    }
}
