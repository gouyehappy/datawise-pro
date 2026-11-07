package org.apache.datawise.backend.domain;

import java.util.List;

public record JenkinsJobParameterDto(
        String name,
        String type,
        String description,
        String defaultValue,
        List<String> choices) {
}
