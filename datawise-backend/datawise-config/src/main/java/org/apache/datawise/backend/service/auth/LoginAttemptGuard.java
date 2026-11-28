package org.apache.datawise.backend.service.auth;

import org.apache.datawise.backend.common.DatawiseErrorCodes;
import org.springframework.stereotype.Service;

/**
 * Login failure throttle keyed by {@code (username, clientIp)} so one IP cannot lock
 * an arbitrary account for all callers (SEC-04). Uses {@link LoginAttemptStore}:
 * memory for desktop/file metadata, JDBC ({@code dw_login_attempt}) when
 * {@code datawise.storage.backend=jdbc} — see docs/DEPLOYMENT.md#affinity.
 */
@Service
public class LoginAttemptGuard {

    public static final String LOGIN_LOCKED = DatawiseErrorCodes.LOGIN_LOCKED;

    static final int MAX_FAILURES = 8;
    static final long WINDOW_MS = 15 * 60 * 1000L;

    private final LoginAttemptStore store;

    public LoginAttemptGuard(LoginAttemptStore store) {
        this.store = store;
    }

    /** Test / fallback constructor — process-local memory store. */
    public LoginAttemptGuard() {
        this(new MemoryLoginAttemptStore());
    }

    public void assertNotLocked(String username, String clientIp) {
        String key = compositeKey(username, clientIp);
        if (key == null) {
            return;
        }
        LoginAttemptStore.AttemptWindow window = store.find(key);
        if (window == null) {
            return;
        }
        long now = System.currentTimeMillis();
        if (now - window.firstFailureAtMs() >= WINDOW_MS) {
            store.delete(key);
            return;
        }
        if (window.failures() >= MAX_FAILURES) {
            throw new IllegalArgumentException(LOGIN_LOCKED);
        }
    }

    public void recordFailure(String username, String clientIp) {
        String key = compositeKey(username, clientIp);
        if (key == null) {
            return;
        }
        long now = System.currentTimeMillis();
        LoginAttemptStore.AttemptWindow existing = store.find(key);
        LoginAttemptStore.AttemptWindow next;
        if (existing == null || now - existing.firstFailureAtMs() >= WINDOW_MS) {
            next = new LoginAttemptStore.AttemptWindow(1, now);
        } else {
            next = new LoginAttemptStore.AttemptWindow(existing.failures() + 1, existing.firstFailureAtMs());
        }
        store.save(key, next);
    }

    public void clearFailures(String username, String clientIp) {
        String key = compositeKey(username, clientIp);
        if (key != null) {
            store.delete(key);
        }
    }

    /**
     * Composite lock key: {@code username|ip}. Missing IP uses {@code unknown}
     * so throttle still applies without collapsing all users into one bucket.
     */
    static String compositeKey(String username, String clientIp) {
        String user = normalizeUsername(username);
        if (user == null) {
            return null;
        }
        String ip = normalizeIp(clientIp);
        return user + "|" + ip;
    }

    private static String normalizeUsername(String username) {
        if (username == null || username.isBlank()) {
            return null;
        }
        return username.trim().toLowerCase();
    }

    private static String normalizeIp(String clientIp) {
        if (clientIp == null || clientIp.isBlank()) {
            return "unknown";
        }
        return clientIp.trim().toLowerCase();
    }
}
