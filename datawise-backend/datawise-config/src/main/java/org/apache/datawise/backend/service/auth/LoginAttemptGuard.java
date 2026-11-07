package org.apache.datawise.backend.service.auth;

import org.springframework.stereotype.Service;

import java.util.concurrent.ConcurrentHashMap;

/**
 * In-memory login failure throttle (per username). Multi-instance deployments need a shared store later.
 */
@Service
public class LoginAttemptGuard {

    public static final String LOGIN_LOCKED = "LOGIN_LOCKED";

    static final int MAX_FAILURES = 8;
    static final long WINDOW_MS = 15 * 60 * 1000L;

    private final ConcurrentHashMap<String, AttemptWindow> attempts = new ConcurrentHashMap<>();

    public void assertNotLocked(String username) {
        String key = normalize(username);
        if (key == null) {
            return;
        }
        AttemptWindow window = attempts.get(key);
        if (window == null) {
            return;
        }
        long now = System.currentTimeMillis();
        if (now - window.firstFailureAt() >= WINDOW_MS) {
            attempts.remove(key, window);
            return;
        }
        if (window.failures() >= MAX_FAILURES) {
            throw new IllegalArgumentException(LOGIN_LOCKED);
        }
    }

    public void recordFailure(String username) {
        String key = normalize(username);
        if (key == null) {
            return;
        }
        attempts.compute(key, (ignored, existing) -> {
            long now = System.currentTimeMillis();
            if (existing == null || now - existing.firstFailureAt() >= WINDOW_MS) {
                return new AttemptWindow(1, now);
            }
            return new AttemptWindow(existing.failures() + 1, existing.firstFailureAt());
        });
    }

    public void clearFailures(String username) {
        String key = normalize(username);
        if (key != null) {
            attempts.remove(key);
        }
    }

    private static String normalize(String username) {
        if (username == null || username.isBlank()) {
            return null;
        }
        return username.trim().toLowerCase();
    }

    private record AttemptWindow(int failures, long firstFailureAt) {
    }
}
