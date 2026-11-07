package org.apache.datawise.backend.domain;

public record TableIndexDetail(
        String name,
        boolean unique,
        String columns) {
}
