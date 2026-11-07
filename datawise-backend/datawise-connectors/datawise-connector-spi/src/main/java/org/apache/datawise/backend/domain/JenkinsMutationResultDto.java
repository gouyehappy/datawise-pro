package org.apache.datawise.backend.domain;

public record JenkinsMutationResultDto(
        boolean success,
        String message,
        String queueUrl) {
}
