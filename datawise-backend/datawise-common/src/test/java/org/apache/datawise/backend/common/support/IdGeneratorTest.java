package org.apache.datawise.backend.common.support;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class IdGeneratorTest {

    @Test
    void secureTokenHasHighEntropyLength() {
        String token = IdGenerator.secureToken("session-");
        assertTrue(token.startsWith("session-"));
        assertEquals("session-".length() + 64, token.length());
        assertNotEquals(token, IdGenerator.secureToken("session-"));
    }
}
