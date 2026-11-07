package org.apache.datawise.backend.domain;

public record CreateProjectRequest(
        String name,
        String colorKey,
        String description,
        String templateId,
        String defaultEnv) {
}
