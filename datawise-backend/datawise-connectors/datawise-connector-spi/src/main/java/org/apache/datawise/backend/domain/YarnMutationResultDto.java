package org.apache.datawise.backend.domain;

public record YarnMutationResultDto(
        boolean success,
        String message,
        String state) {
}
