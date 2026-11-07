package org.apache.datawise.backend.domain;

/** Result of CREATE DATABASE / CREATE SCHEMA. */
public record CreateNamespaceResult(
        String name,
        String kind,
        String sql,
        boolean created) {
}
