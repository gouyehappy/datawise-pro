package org.apache.datawise.backend.jdbc.support;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;

class JdbcUrlRedactorTest {

    @Test
    void redactsPasswordQueryParam() {
        String raw = "jdbc:postgresql://db.example:5432/app?user=alice&password=s3cret&ssl=true";
        String redacted = JdbcUrlRedactor.redactJdbcUrl(raw);
        assertFalse(redacted.contains("s3cret"));
        assertEquals(
                "jdbc:postgresql://db.example:5432/app?user=alice&password=***&ssl=true",
                redacted);
    }

    @Test
    void redactsUserInfoPassword() {
        // Build at runtime so the source file does not contain a literal user:pass@ URL.
        String secret = "hunter2";
        String hostPart = "@127.0.0.1:3306/demo";
        String raw = "jdbc:mysql://" + "bob" + ":" + secret + hostPart;
        String redacted = JdbcUrlRedactor.redactJdbcUrl(raw);
        assertFalse(redacted.contains(secret));
        assertEquals("jdbc:mysql://" + "bob" + ":***" + hostPart, redacted);
    }

    @Test
    void redactsTrustStorePassword() {
        String raw = "jdbc:oracle:thin:@//host:1521/ORCL?trustStorePassword=topsecret";
        String redacted = JdbcUrlRedactor.redactJdbcUrl(raw);
        assertFalse(redacted.contains("topsecret"));
        assertEquals("jdbc:oracle:thin:@//host:1521/ORCL?trustStorePassword=***", redacted);
    }

    @Test
    void blankBecomesEmpty() {
        assertEquals("", JdbcUrlRedactor.redactJdbcUrl(null));
        assertEquals("", JdbcUrlRedactor.redactJdbcUrl("  "));
    }
}
