package org.apache.datawise.backend.domain;

/** Result of deleting redundant / orphan connector plugin JARs under {@code config/plugins}. */
public record CleanupConnectorPluginsResultDto(
        int deletedCount,
        java.util.List<String> deletedJars,
        java.util.List<String> failedJars,
        String message) {
}
