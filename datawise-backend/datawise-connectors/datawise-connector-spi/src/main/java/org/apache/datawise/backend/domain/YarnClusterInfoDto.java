package org.apache.datawise.backend.domain;

public record YarnClusterInfoDto(
        String id,
        String state,
        String haState,
        String resourceManagerVersion,
        String hadoopVersion) {
}
