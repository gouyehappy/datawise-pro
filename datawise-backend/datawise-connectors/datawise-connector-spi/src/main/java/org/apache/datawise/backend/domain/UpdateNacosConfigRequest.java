package org.apache.datawise.backend.domain;

/** Publish / update an existing Nacos config. */
public record UpdateNacosConfigRequest(
        String dataId,
        String group,
        String namespaceId,
        String content,
        String type) {
}
