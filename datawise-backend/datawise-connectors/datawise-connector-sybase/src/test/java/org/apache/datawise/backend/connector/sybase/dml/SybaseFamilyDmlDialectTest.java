package org.apache.datawise.backend.connector.sybase.dml;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertTrue;

class SybaseFamilyDmlDialectTest {

    private final SybaseFamilyDmlDialect dialect = new SybaseFamilyDmlDialect();

    @Test
    void supportsSybase() {
        assertTrue(dialect.supports("sybase"));
    }
}
