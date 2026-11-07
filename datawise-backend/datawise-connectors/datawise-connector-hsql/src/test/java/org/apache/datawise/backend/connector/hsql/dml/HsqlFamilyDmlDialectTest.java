package org.apache.datawise.backend.connector.hsql.dml;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertTrue;

class HsqlFamilyDmlDialectTest {

    private final HsqlFamilyDmlDialect dialect = new HsqlFamilyDmlDialect();

    @Test
    void supportsHsql() {
        assertTrue(dialect.supports("hsql"));
    }
}
