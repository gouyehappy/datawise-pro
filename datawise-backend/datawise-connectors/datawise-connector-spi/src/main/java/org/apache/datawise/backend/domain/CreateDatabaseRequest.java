package org.apache.datawise.backend.domain;

/** Request body for creating a database on a JDBC connection. */
public record CreateDatabaseRequest(
        String name,
        String charset,
        String collation) {
}
