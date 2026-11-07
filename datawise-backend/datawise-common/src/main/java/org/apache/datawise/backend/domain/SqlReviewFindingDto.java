package org.apache.datawise.backend.domain;

public record SqlReviewFindingDto(
        String severity,
        String code,
        String message,
        String suggestion) {
}
