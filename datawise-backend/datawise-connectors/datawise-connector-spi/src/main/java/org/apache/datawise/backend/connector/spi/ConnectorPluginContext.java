package org.apache.datawise.backend.connector.spi;

import org.apache.datawise.backend.connector.spi.ConnectorJdbcOperations;

/** Host-provided dependencies for connector plugins (from {@code datawise-connector-api} on the app classpath). */
public record ConnectorPluginContext(ConnectorJdbcOperations jdbc) {
}
