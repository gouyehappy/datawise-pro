package org.apache.datawise.backend.security;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class HeadlessSqlAuthTest {

    @AfterEach
    void tearDown() {
        UserContext.clear();
    }

    @Test
    void allowsRegisteredSession() {
        UserContext.set(1L, false, "session-1");
        assertDoesNotThrow(HeadlessSqlAuth::requireSqlAccess);
    }

    @Test
    void allowsGuestSession() {
        UserContext.set(3L, true, "guest-session");
        assertDoesNotThrow(HeadlessSqlAuth::requireSqlAccess);
    }

    @Test
    void allowsAnonymousSessionPath() {
        assertDoesNotThrow(HeadlessSqlAuth::requireSqlAccess);
    }

    @Test
    void allowsApiTokenWithSqlScope() {
        UserContext.setApiToken(1L, "tok-1", Set.of(ApiTokenScopes.SQL));
        assertDoesNotThrow(HeadlessSqlAuth::requireSqlAccess);
    }

    @Test
    void rejectsApiTokenWithoutSqlScope() {
        UserContext.setApiToken(1L, "tok-1", Set.of(ApiTokenScopes.MIGRATION));
        IllegalArgumentException ex = assertThrows(IllegalArgumentException.class, HeadlessSqlAuth::requireSqlAccess);
        assertEquals(HeadlessMigrationAuth.API_TOKEN_FORBIDDEN, ex.getMessage());
    }
}
