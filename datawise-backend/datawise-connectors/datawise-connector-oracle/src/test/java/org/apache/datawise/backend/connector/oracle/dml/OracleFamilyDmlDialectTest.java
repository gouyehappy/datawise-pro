package org.apache.datawise.backend.connector.oracle.dml;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class OracleFamilyDmlDialectTest {

    private final OracleFamilyDmlDialect dialect = new OracleFamilyDmlDialect();

    @Test
    void supportsOracle() {
        assertTrue(dialect.supports("oracle"));
    }

    @Test
    void qualifiedTable_usesSchemaQualifiedNames() {
        assertEquals(
                "\"HR\".\"EMPLOYEES\"",
                dialect.qualifiedTable("HR", "EMPLOYEES")
        );
    }

    @Test
    void quoteIdentifier_usesDoubleQuotes() {
        assertEquals("\"USER_NAME\"", dialect.quoteIdentifier("USER_NAME"));
    }
}
