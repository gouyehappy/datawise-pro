package org.apache.datawise.backend.service.auth;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class LoginAttemptGuardTest {

    @Test
    void locksAfterMaxFailuresAndClearsOnSuccess() {
        LoginAttemptGuard guard = new LoginAttemptGuard();
        for (int i = 0; i < LoginAttemptGuard.MAX_FAILURES; i++) {
            guard.recordFailure("Admin");
        }
        IllegalArgumentException locked = assertThrows(IllegalArgumentException.class, () -> guard.assertNotLocked("admin"));
        assertEquals(LoginAttemptGuard.LOGIN_LOCKED, locked.getMessage());

        guard.clearFailures("admin");
        assertDoesNotThrow(() -> guard.assertNotLocked("admin"));
    }

    @Test
    void unknownUserFailuresStillThrottle() {
        LoginAttemptGuard guard = new LoginAttemptGuard();
        for (int i = 0; i < LoginAttemptGuard.MAX_FAILURES; i++) {
            guard.recordFailure("nobody");
        }
        assertThrows(IllegalArgumentException.class, () -> guard.assertNotLocked("nobody"));
    }
}
