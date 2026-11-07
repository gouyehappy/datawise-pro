package org.apache.datawise.backend.connector.dm.dml;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class DmFamilyDmlDialectTest {

    private final DmFamilyDmlDialect dialect = new DmFamilyDmlDialect();

    @Test
    void supportsDm() {
        assertTrue(dialect.supports("dm"));
    }

    @Test
    void qualifiedTable_usesSchemaQualifiedNames() {
        assertEquals(
                "\"SYSDBA\".\"EMPLOYEES\"",
                dialect.qualifiedTable("SYSDBA", "EMPLOYEES")
        );
    }

    @Test
    void quoteIdentifier_usesDoubleQuotes() {
        assertEquals("\"USER_NAME\"", dialect.quoteIdentifier("USER_NAME"));
    }
}
