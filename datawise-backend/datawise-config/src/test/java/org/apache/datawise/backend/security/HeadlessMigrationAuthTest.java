package org.apache.datawise.backend.security;

import org.apache.datawise.backend.common.UnauthorizedException;
import org.apache.datawise.backend.service.UserAccessPolicy;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class HeadlessMigrationAuthTest {

    @AfterEach
    void tearDown() {
        UserContext.clear();
    }

    @Test
    void allowsRegisteredSession() {
        UserContext.set(1L, false, "session-1");
        assertDoesNotThrow(HeadlessMigrationAuth::requireMigrationAccess);
    }

    @Test
    void rejectsAnonymous() {
        UnauthorizedException ex = assertThrows(UnauthorizedException.class, HeadlessMigrationAuth::requireMigrationAccess);
        assertEquals(UnauthorizedException.CODE, ex.getMessage());
    }

    @Test
    void rejectsGuestSession() {
        UserContext.set(3L, true, "guest-session");
        IllegalArgumentException ex = assertThrows(IllegalArgumentException.class, HeadlessMigrationAuth::requireMigrationAccess);
        assertEquals(UserAccessPolicy.GUEST_NOT_ALLOWED, ex.getMessage());
    }

    @Test
    void allowsApiTokenWithMigrationScope() {
        UserContext.setApiToken(1L, "tok-1", Set.of(ApiTokenScopes.MIGRATION));
        assertDoesNotThrow(HeadlessMigrationAuth::requireMigrationAccess);
    }

    @Test
    void rejectsApiTokenWithoutMigrationScope() {
        UserContext.setApiToken(1L, "tok-1", Set.of("other"));
        IllegalArgumentException ex = assertThrows(IllegalArgumentException.class, HeadlessMigrationAuth::requireMigrationAccess);
        assertEquals(HeadlessMigrationAuth.API_TOKEN_FORBIDDEN, ex.getMessage());
    }

    @Test
    void rejectsApiTokenWithoutMigrationScopeForConfigLayout() {
        UserContext.setApiToken(1L, "tok-1", Set.of("other"));
        IllegalArgumentException ex = assertThrows(
                IllegalArgumentException.class,
                () -> HeadlessMigrationAuth.requireConfigLayoutMigrationAccess(null));
        assertEquals(HeadlessMigrationAuth.API_TOKEN_FORBIDDEN, ex.getMessage());
    }

    @Test
    void allowsApiTokenWithMigrationScopeForConfigLayout() {
        UserContext.setApiToken(1L, "tok-1", Set.of(ApiTokenScopes.MIGRATION));
        assertDoesNotThrow(() -> HeadlessMigrationAuth.requireConfigLayoutMigrationAccess(null));
    }
}
