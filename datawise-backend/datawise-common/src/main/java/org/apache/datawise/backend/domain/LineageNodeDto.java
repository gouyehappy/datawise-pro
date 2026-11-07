package org.apache.datawise.backend.domain;

public record LineageNodeDto(
        String id,
        String kind,
        String label,
        String qualifiedName,
        String dataType,
        String expression,
        String expressionKind) {
}
