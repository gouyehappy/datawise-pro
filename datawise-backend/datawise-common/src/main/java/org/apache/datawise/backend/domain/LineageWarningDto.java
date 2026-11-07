package org.apache.datawise.backend.domain;

public record LineageWarningDto(
        String code,
        String message,
        Integer line,
        Integer column) {
}
