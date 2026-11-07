package org.apache.datawise.backend.connector.sqlite.dml;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class SqliteFamilyDmlDialectTest {

    private final SqliteFamilyDmlDialect dialect = new SqliteFamilyDmlDialect();

    @Test
    void supportsSqliteAliases() {
        assertTrue(dialect.supports("sqlite"));
        assertTrue(dialect.supports("sqlite3"));
    }

    @Test
    void quotesIdentifiers() {
        assertEquals("\"users\"", dialect.quoteIdentifier("users"));
    }
}
