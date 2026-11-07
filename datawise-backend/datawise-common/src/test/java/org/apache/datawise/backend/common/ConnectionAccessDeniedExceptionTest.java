package org.apache.datawise.backend.common;

import org.apache.datawise.backend.common.support.ConnectionAccessLevel;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

class ConnectionAccessDeniedExceptionTest {

    @Test
    void messageIncludesDiagnosticFields() {
        ConnectionAccessDeniedException ex = new ConnectionAccessDeniedException(
                7L,
                "kafka-1",
                "DML",
                ConnectionAccessLevel.READONLY,
                "requireDmlAccess");

        assertEquals(
                "CONNECTION_ACCESS_DENIED connectionId=kafka-1 userId=7 required=DML actual=READONLY op=requireDmlAccess",
                ex.getMessage());
        assertEquals(7L, ex.getUserId());
        assertEquals("kafka-1", ex.getConnectionId());
        assertEquals("DML", ex.getRequiredAccess());
        assertEquals("READONLY", ex.getActualAccess());
        assertEquals("requireDmlAccess", ex.getOperation());
    }
}
