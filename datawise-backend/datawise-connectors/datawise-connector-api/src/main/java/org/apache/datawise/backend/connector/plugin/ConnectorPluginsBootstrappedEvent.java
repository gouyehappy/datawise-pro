package org.apache.datawise.backend.connector.plugin;

/** Published after the deferred {@code config/plugins} scan finishes (success or empty). */
public final class ConnectorPluginsBootstrappedEvent {

    public static final ConnectorPluginsBootstrappedEvent INSTANCE = new ConnectorPluginsBootstrappedEvent();

    private ConnectorPluginsBootstrappedEvent() {
    }
}
