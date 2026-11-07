package org.apache.datawise.backend.domain;

public record K8sContainerDto(
        String name,
        String image,
        boolean ready,
        int restartCount,
        String state) {
}
