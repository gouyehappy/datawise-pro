package org.apache.datawise.backend.service.auth;

/**
 * Persistence for {@link LoginAttemptGuard}. Memory for desktop/dev; JDBC when
 * {@code datawise.storage.backend=jdbc}. Keys are opaque composite strings
 * ({@code username|ip}), not bare usernames.
 */
public interface LoginAttemptStore {

    record AttemptWindow(int failures, long firstFailureAtMs) {
    }

    AttemptWindow find(String attemptKey);

    void save(String attemptKey, AttemptWindow window);

    void delete(String attemptKey);
}
