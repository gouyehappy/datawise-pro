package org.apache.datawise.backend.connector.db2.dml;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class Db2FamilyDmlDialectTest {

    private final Db2FamilyDmlDialect dialect = new Db2FamilyDmlDialect();

    @Test
    void supportsDb2() {
        assertTrue(dialect.supports("db2"));
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
