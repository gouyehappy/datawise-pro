package org.apache.datawise.backend.domain;

public record KafkaMutationResultDto(
        boolean success,
        String message) {
}
