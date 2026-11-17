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
            guard.recordFailure("Admin", "10.0.0.1");
        }
        IllegalArgumentException locked = assertThrows(
                IllegalArgumentException.class,
                () -> guard.assertNotLocked("admin", "10.0.0.1"));
        assertEquals(LoginAttemptGuard.LOGIN_LOCKED, locked.getMessage());

        guard.clearFailures("admin", "10.0.0.1");
        assertDoesNotThrow(() -> guard.assertNotLocked("admin", "10.0.0.1"));
    }

    @Test
    void unknownUserFailuresStillThrottle() {
        LoginAttemptGuard guard = new LoginAttemptGuard();
        for (int i = 0; i < LoginAttemptGuard.MAX_FAILURES; i++) {
            guard.recordFailure("nobody", "10.0.0.2");
        }
        assertThrows(IllegalArgumentException.class, () -> guard.assertNotLocked("nobody", "10.0.0.2"));
    }

    @Test
    void lockIsScopedToUsernameAndIp() {
        LoginAttemptGuard guard = new LoginAttemptGuard();
        for (int i = 0; i < LoginAttemptGuard.MAX_FAILURES; i++) {
            guard.recordFailure("alice", "10.0.0.1");
        }
        assertThrows(IllegalArgumentException.class, () -> guard.assertNotLocked("alice", "10.0.0.1"));
        // Same user from another IP is not locked (SEC-04).
        assertDoesNotThrow(() -> guard.assertNotLocked("alice", "10.0.0.2"));
        // Different user from attacker IP is not locked.
        assertDoesNotThrow(() -> guard.assertNotLocked("bob", "10.0.0.1"));
    }

    @Test
    void compositeKeyNormalizesUsernameAndIp() {
        assertEquals("alice|10.0.0.1", LoginAttemptGuard.compositeKey("Alice", "10.0.0.1"));
        assertEquals("alice|unknown", LoginAttemptGuard.compositeKey("alice", null));
    }
}
