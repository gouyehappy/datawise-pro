package org.apache.datawise.backend.domain;

/** Update an existing Polaris config file and release it. */
public record UpdatePolarisConfigRequest(
        String name,
        String namespace,
        String group,
        String content,
        String format) {
}
