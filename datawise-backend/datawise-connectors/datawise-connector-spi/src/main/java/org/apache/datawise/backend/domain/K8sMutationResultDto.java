package org.apache.datawise.backend.domain;

public record K8sMutationResultDto(
        boolean success,
        String message,
        String state) {
}
