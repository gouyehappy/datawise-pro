package org.apache.datawise.backend.domain;

public record K8sDeploymentDto(
        String name,
        String namespace,
        int replicas,
        int readyReplicas,
        int availableReplicas,
        int updatedReplicas,
        String creationTimestamp) {
}
