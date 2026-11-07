package org.apache.datawise.backend.domain;

public record NacosServiceDto(
        String name,
        String groupName,
        String clusterCount) {
}
