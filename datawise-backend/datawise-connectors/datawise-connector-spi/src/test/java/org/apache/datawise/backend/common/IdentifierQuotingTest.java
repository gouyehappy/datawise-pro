package org.apache.datawise.backend.common;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

class IdentifierQuotingTest {

    @Test
    void quotesMysqlStyleBackticks() {
        assertEquals("`a``b`", IdentifierQuoting.quote("a`b", "`", FieldIdeEnum.ORIGINAL));
    }

    @Test
    void quotesPostgresStyleDoubleQuotes() {
        assertEquals("\"a\"\"b\"", IdentifierQuoting.quote("a\"b", "\"", FieldIdeEnum.ORIGINAL));
    }

    @Test
    void quotesSqlServerBrackets() {
        assertEquals("[a]]b]", IdentifierQuoting.quote("a]b", "[", FieldIdeEnum.ORIGINAL));
    }

    @Test
    void appliesFieldIdeBeforeQuoting() {
        assertEquals("`USERS`", IdentifierQuoting.quote("users", "`", FieldIdeEnum.UPPERCASE));
        assertEquals("\"users\"", IdentifierQuoting.quote("USERS", "\"", FieldIdeEnum.LOWERCASE));
    }

    @Test
    void leavesStarAndBlankUnquoted() {
        assertEquals("*", IdentifierQuoting.quote("*", "`", FieldIdeEnum.ORIGINAL));
        assertEquals("", IdentifierQuoting.quote("", "`", FieldIdeEnum.ORIGINAL));
        assertNull(IdentifierQuoting.quote(null, "`", FieldIdeEnum.ORIGINAL));
    }
}
