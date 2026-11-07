package org.apache.datawise.backend.domain;

/**
 * Boot-time plugin scan status for the live connector registry.
 * <p>
 * When deferred loading is enabled, the registry starts with classpath connectors only
 * and {@code phase} moves {@code PENDING → LOADING → READY} after {@code ApplicationReady}.
 */
public record ConnectorPluginLoadStatusDto(
        String phase,
        boolean ready,
        int loadedJarCount,
        int loadedConnectorCount,
        int failureCount) {
}
