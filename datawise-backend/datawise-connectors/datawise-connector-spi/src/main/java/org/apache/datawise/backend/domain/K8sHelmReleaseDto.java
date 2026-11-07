package org.apache.datawise.backend.domain;

/** Helm release inferred from Secret metadata (no chart payload values). */
public record K8sHelmReleaseDto(
        String name,
        String namespace,
        String status,
        String chart,
        String appVersion,
        int revision,
        String updated) {
}
