package org.apache.datawise.backend.domain;

public record NacosConfigDto(
        String dataId,
        String group,
        String tenant,
        String type,
        String appName,
        String md5) {
}
