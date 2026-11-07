package org.apache.datawise.backend.domain;

import com.fasterxml.jackson.annotation.JsonInclude;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record ConnectionGroupDto(
        String id,
        String label,
        String parentId,
        int sortOrder,
        boolean expanded,
        Long userId,
        String projectId) {
}
