package org.apache.datawise.backend.dml.render;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

class DmlSqlSupportTest {

    @Test
    void sqlLiteralEscapesBackslashBeforeQuote() {
        assertEquals("'abc\\\\'", DmlSqlSupport.sqlLiteral("abc\\"));
        assertEquals("'a\\\\b''c'", DmlSqlSupport.sqlLiteral("a\\b'c"));
        assertEquals("'plain'", DmlSqlSupport.sqlLiteral("plain"));
    }

    @Test
    void sqlLiteralRendersBinaryAsAnsiHex() {
        assertEquals("X''", DmlSqlSupport.sqlLiteral(new byte[0]));
        assertEquals("X'00FF'", DmlSqlSupport.sqlLiteral(new byte[]{0x00, (byte) 0xFF}));
        assertEquals("X'4869'", DmlSqlSupport.sqlLiteral(new byte[]{'H', 'i'}));
    }

    @Test
    void dialectBinaryLiterals() {
        byte[] bytes = new byte[]{0x0A, 0x0B};
        assertEquals("X'0A0B'", DmlSqlSupport.binaryLiteralAnsi(bytes));
        assertEquals("'\\x0a0b'::bytea", DmlSqlSupport.binaryLiteralPostgres(bytes));
        assertEquals("0x0A0B", DmlSqlSupport.binaryLiteralSqlServer(bytes));
    }
}
