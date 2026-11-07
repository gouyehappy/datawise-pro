package org.apache.datawise.backend.domain;

public record UpdateProjectRequest(
        String name,
        String colorKey,
        String description,
        Boolean archived,
        String docsDir,
        String scriptsDir,
        String defaultEnv,
        String templateId) {
}
