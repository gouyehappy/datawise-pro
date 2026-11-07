package org.apache.datawise.backend.domain;

public record K8sEventDto(
        String type,
        String reason,
        String message,
        String involvedKind,
        String involvedName,
        int count,
        String lastTimestamp) {
}
