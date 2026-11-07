package org.apache.datawise.backend.domain;

import com.fasterxml.jackson.annotation.JsonInclude;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record ActiveProjectDto(
        String projectId,
        ProjectDto project) {
}
