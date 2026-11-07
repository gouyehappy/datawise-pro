package org.apache.datawise.backend.domain;

public record JenkinsInfoDto(
        String nodeName,
        String nodeDescription,
        String mode,
        String version,
        int numExecutors,
        boolean useCrumbs,
        String url) {
}
