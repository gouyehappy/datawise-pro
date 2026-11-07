package org.apache.datawise.backend.database.sql;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class SqlPayloadLimitsTest {

    @Test
    void allowsPayloadWithinLimit() {
        assertDoesNotThrow(() -> SqlPayloadLimits.requireWithinLimit("select 1"));
    }

    @Test
    void rejectsOversizedPayload() {
        String oversized = "x".repeat(SqlPayloadLimits.MAX_SQL_CHARS + 1);
        IllegalArgumentException ex = assertThrows(
                IllegalArgumentException.class,
                () -> SqlPayloadLimits.requireWithinLimit(oversized)
        );
        assertEquals(
                "SQL exceeds maximum length of " + SqlPayloadLimits.MAX_SQL_CHARS + " characters",
                ex.getMessage()
        );
    }
}
