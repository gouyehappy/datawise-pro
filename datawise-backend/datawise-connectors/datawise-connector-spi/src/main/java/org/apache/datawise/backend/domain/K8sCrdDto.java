package org.apache.datawise.backend.domain;

public record K8sCrdDto(
        String name,
        String group,
        String version,
        String kind,
        String scope,
        String creationTimestamp) {
}
