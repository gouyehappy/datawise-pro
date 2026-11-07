package org.apache.datawise.backend.domain;

public record NacosConfigContentDto(
        String dataId,
        String group,
        String tenant,
        String content,
        String type,
        String md5,
        String appName) {
}
