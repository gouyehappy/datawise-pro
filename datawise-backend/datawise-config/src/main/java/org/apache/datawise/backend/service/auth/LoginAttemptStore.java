package org.apache.datawise.backend.service.auth;

/**
 * Persistence for {@link LoginAttemptGuard}. Memory for desktop/dev; JDBC when
 * {@code datawise.storage.backend=jdbc}.
 */
public interface LoginAttemptStore {

    record AttemptWindow(int failures, long firstFailureAtMs) {
    }

    AttemptWindow find(String usernameKey);

    void save(String usernameKey, AttemptWindow window);

    void delete(String usernameKey);
}
