package org.apache.datawise.backend.domain;

/** Connector plugin JAR load failure surfaced for catalog / ops diagnostics. */
public record ConnectorPluginLoadFailure(String jarName, String reason) {
}
