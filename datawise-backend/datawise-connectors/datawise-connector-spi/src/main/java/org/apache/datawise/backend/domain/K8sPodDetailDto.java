package org.apache.datawise.backend.domain;

import java.util.List;
import java.util.Map;

public record K8sPodDetailDto(
        String name,
        String namespace,
        String phase,
        String nodeName,
        String podIp,
        String hostIp,
        int restartCount,
        String ready,
        String reason,
        String message,
        String creationTimestamp,
        Map<String, String> labels,
        List<K8sContainerDto> containers) {
}
