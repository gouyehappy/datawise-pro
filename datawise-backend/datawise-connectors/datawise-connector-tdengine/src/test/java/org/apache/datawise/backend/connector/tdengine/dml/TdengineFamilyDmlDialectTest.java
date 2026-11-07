package org.apache.datawise.backend.connector.tdengine.dml;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertTrue;

class TdengineFamilyDmlDialectTest {

    private final TdengineFamilyDmlDialect dialect = new TdengineFamilyDmlDialect();

    @Test
    void supportsTdengine() {
        assertTrue(dialect.supports("tdengine"));
    }
}
