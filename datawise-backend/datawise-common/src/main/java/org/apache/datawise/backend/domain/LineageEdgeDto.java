package org.apache.datawise.backend.domain;

public record LineageEdgeDto(
        String id,
        String from,
        String to,
        String role,
        String label) {
}
