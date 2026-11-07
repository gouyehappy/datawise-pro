package org.apache.datawise.backend.domain;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.time.Instant;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record ProjectDto(
        String id,
        String name,
        String colorKey,
        String description,
        Instant createdAt,
        Instant updatedAt,
        boolean archived,
        String docsDir,
        String scriptsDir,
        boolean isDefault,
        String defaultEnv,
        String templateId) {
}
