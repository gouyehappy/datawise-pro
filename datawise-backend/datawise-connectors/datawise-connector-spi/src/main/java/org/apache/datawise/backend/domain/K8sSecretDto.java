package org.apache.datawise.backend.domain;

import java.util.List;

/** Secret metadata only — never includes Secret data values. */
public record K8sSecretDto(
        String name,
        String namespace,
        String type,
        List<String> keys,
        int dataCount,
        String creationTimestamp) {
}
