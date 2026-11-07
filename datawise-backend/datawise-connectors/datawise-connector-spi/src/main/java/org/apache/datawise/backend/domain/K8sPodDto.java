package org.apache.datawise.backend.domain;

public record K8sPodDto(
        String name,
        String namespace,
        String phase,
        String nodeName,
        String podIp,
        int restartCount,
        String ready,
        String creationTimestamp) {
}
