package org.apache.datawise.backend.domain;

import java.util.Map;

public record JenkinsTriggerBuildRequest(
        Map<String, String> parameters) {
}
