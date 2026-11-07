package org.apache.datawise.backend.domain;

/** Request body for creating a schema on a JDBC connection. */
public record CreateSchemaRequest(
        String name,
        String catalog) {
}
