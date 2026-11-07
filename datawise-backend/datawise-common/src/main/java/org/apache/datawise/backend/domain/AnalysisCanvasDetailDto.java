package org.apache.datawise.backend.domain;

import org.apache.datawise.backend.model.AiCanvasParameter;

import java.time.Instant;
import java.util.List;

public record AnalysisCanvasDetailDto(
        String id,
        String title,
        String description,
        String promptTemplate,
        List<AiCanvasParameter> parameters,
        String sql,
        String summary,
        String chartSpecJson,
        String reportMarkdown,
        String targetsJson,
        Instant createdAt,
        Instant updatedAt) {
}
