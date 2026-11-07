package org.apache.datawise.backend.domain;

import java.util.List;

/** ConfigMap summary; dataValues lists key names only (values omitted for size/safety). */
public record K8sConfigMapDto(
        String name,
        String namespace,
        List<String> keys,
        int dataCount,
        String creationTimestamp) {
}
