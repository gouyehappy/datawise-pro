package org.apache.datawise.backend.domain;

/**
 * Tenant-shared data-quality rule template.
 */
public record DataQualityTemplateDto(
        String id,
        String name,
        String description,
        String sql,
        String assertion,
        String expected,
        String column,
        boolean blocking,
        String cronExpression,
        String createdAt,
        String updatedAt,
        Long createdByUserId) {
}
