package org.apache.datawise.backend.connector.dm.schema;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class DmSchemaDialectTest {

    private final DmSchemaDialect dialect = new DmSchemaDialect();

    @Test
    void filtersSystemSchemas() {
        assertTrue(dialect.isSystemSchema("SYS"));
        assertTrue(dialect.isSystemSchema("SYSDBA"));
        assertFalse(dialect.isSystemSchema("HR"));
    }
}
