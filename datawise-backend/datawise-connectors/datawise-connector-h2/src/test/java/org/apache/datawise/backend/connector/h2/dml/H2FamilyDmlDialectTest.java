package org.apache.datawise.backend.connector.h2.dml;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertTrue;

class H2FamilyDmlDialectTest {

    private final H2FamilyDmlDialect dialect = new H2FamilyDmlDialect();

    @Test
    void supportsH2() {
        assertTrue(dialect.supports("h2"));
    }
}
