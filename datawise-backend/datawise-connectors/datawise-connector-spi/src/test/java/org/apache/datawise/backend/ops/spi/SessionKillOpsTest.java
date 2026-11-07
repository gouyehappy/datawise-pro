package org.apache.datawise.backend.ops.spi;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class SessionKillOpsTest {

    @Test
    void normalizesKillMode() {
        assertEquals(SessionKillOps.MODE_QUERY, SessionKillOps.normalizeMode(null));
        assertEquals(SessionKillOps.MODE_QUERY, SessionKillOps.normalizeMode("query"));
        assertEquals(SessionKillOps.MODE_CONNECTION, SessionKillOps.normalizeMode("connection"));
        assertEquals(SessionKillOps.MODE_CONNECTION, SessionKillOps.normalizeMode(" CONNECTION "));
    }

    @Test
    void rejectsInvalidSessionId() {
        assertThrows(IllegalArgumentException.class, () -> SessionKillOps.validateSessionId(null));
        assertThrows(IllegalArgumentException.class, () -> SessionKillOps.validateSessionId("abc;drop"));
    }
}
