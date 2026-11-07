package org.apache.datawise.backend.connector.db2.schema;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class Db2SchemaDialectTest {

    private final Db2SchemaDialect dialect = new Db2SchemaDialect();

    @Test
    void filtersSystemSchemas() {
        assertTrue(dialect.isSystemSchema("SYSIBM"));
        assertTrue(dialect.isSystemSchema("SYSCAT"));
        assertFalse(dialect.isSystemSchema("HR"));
    }
}
