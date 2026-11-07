package org.apache.datawise.backend.domain;

public record K8sLogsDto(
        String namespace,
        String pod,
        String container,
        String content) {
}
