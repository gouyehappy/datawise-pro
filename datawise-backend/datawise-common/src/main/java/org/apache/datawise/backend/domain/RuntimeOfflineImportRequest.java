package org.apache.datawise.backend.domain;

/** Admin-only: import connectors/drivers from a local offline zip path. */
public record RuntimeOfflineImportRequest(String path) {
}
