package org.apache.datawise.backend.domain;

import jakarta.validation.constraints.NotBlank;

/**
 * Create or update a tenant-shared data-quality rule template.
 */
public record SaveDataQualityTemplateRequest(
        String id,
        @NotBlank(message = "name and sql are required") String name,
        String description,
        @NotBlank(message = "name and sql are required") String sql,
        String assertion,
        String expected,
        String column,
        Boolean blocking,
        String cronExpression) {
}
