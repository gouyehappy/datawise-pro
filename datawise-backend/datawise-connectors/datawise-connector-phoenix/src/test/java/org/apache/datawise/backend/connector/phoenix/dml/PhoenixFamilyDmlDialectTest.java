package org.apache.datawise.backend.connector.phoenix.dml;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertTrue;

class PhoenixFamilyDmlDialectTest {

    private final PhoenixFamilyDmlDialect dialect = new PhoenixFamilyDmlDialect();

    @Test
    void supportsPhoenix() {
        assertTrue(dialect.supports("phoenix"));
    }
}
