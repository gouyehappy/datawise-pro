package org.apache.datawise.backend.domain;

public record RenameInstanceSqlRequest(
        String connectionId,
        String instanceName,
        String oldFileName,
        String newFileName) {
}
