package org.apache.datawise.backend.connector.oscar.dml;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class OscarFamilyDmlDialectTest {

    private final OscarFamilyDmlDialect dialect = new OscarFamilyDmlDialect();

    @Test
    void supportsOscar() {
        assertTrue(dialect.supports("oscar"));
    }

    @Test
    void qualifiedTable_usesSchemaQualifiedNames() {
        assertEquals(
                "\"APP\".\"EMPLOYEES\"",
                dialect.qualifiedTable("APP", "EMPLOYEES")
        );
    }

    @Test
    void quoteIdentifier_usesDoubleQuotes() {
        assertEquals("\"USER_NAME\"", dialect.quoteIdentifier("USER_NAME"));
    }
}
