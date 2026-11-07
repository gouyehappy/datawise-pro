package org.apache.datawise.backend.domain;

public record K8sAppliedResourceDto(
        String apiVersion,
        String kind,
        String namespace,
        String name,
        String action,
        boolean success,
        String message) {
}
