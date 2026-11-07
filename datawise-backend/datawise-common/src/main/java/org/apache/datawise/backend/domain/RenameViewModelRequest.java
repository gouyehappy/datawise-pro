package org.apache.datawise.backend.domain;

public record RenameViewModelRequest(
        String connectionId,
        String instanceName,
        String oldName,
        String newName) {
}
