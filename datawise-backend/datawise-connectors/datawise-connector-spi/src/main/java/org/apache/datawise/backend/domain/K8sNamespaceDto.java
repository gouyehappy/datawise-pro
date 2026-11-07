package org.apache.datawise.backend.domain;

public record K8sNamespaceDto(
        String name,
        String status,
        String creationTimestamp) {
}
