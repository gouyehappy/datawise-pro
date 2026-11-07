package org.apache.datawise.backend.security;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;

class ClientErrorMessageSupportTest {

    @AfterEach
    void tearDown() {
        UserContext.clear();
    }

    @Test
    void preservesDetailForSessionAuth() {
        UserContext.set(1L, false, "session-1");
        assertEquals("syntax error near foo", ClientErrorMessageSupport.sqlExecutionMessage("syntax error near foo"));
        assertEquals("bad field", ClientErrorMessageSupport.forClient("bad field"));
    }

    @Test
    void hidesDetailForApiTokenAuth() {
        UserContext.setApiToken(1L, "tok-1", Set.of(ApiTokenScopes.SQL));
        assertEquals(ClientErrorMessageSupport.SQL_EXECUTION_FAILED,
                ClientErrorMessageSupport.sqlExecutionMessage("syntax error near foo"));
        assertEquals(ClientErrorMessageSupport.GENERIC_BAD_REQUEST,
                ClientErrorMessageSupport.forClient("internal jdbc://secret-host details"));
    }

    @Test
    void keepsValidationMessagesForApiTokenAuth() {
        UserContext.setApiToken(1L, "tok-1", Set.of(ApiTokenScopes.SQL));
        assertEquals("connection not found", ClientErrorMessageSupport.forClient("connection not found"));
        assertEquals("SQL cursor not found or expired",
                ClientErrorMessageSupport.forClient("SQL cursor not found or expired"));
    }
}
